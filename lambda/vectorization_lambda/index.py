import json
import logging
import math
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.client import BaseClient
from langchain.text_splitter import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field
from upstash_vector import Index, Vector
from upstash_vector.types import SparseVector

# Configure logging
logger = logging.getLogger()
logger.setLevel(os.environ.get('LOG_LEVEL', 'INFO'))

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 100


class ProcessedItem(BaseModel):
    """Model for processed items from the data processing Lambda"""
    title: Optional[str] = None
    source_text: Optional[str] = None
    source_link: Optional[str] = None
    description: Optional[str] = None
    url: str
    content_type: Optional[str] = None
    extracted_at: datetime = Field(default_factory=datetime.now)
    markdown: Optional[str] = None


class ProcessingResult(BaseModel):
    """Model for vectorization results"""
    successful: int = 0
    failed: List[Dict[str, str]] = []


def get_upstash_credentials(secrets_client: BaseClient) -> tuple[str, str]:
    """Retrieve Upstash credentials from Secrets Manager"""
    endpoint_name = os.environ['UPSTASH_ENDPOINT_SECRET_NAME']
    logger.info(f"Getting secret for endpoint name: {endpoint_name}")
    endpoint_secret = secrets_client.get_secret_value(
        SecretId=endpoint_name
    )

    token_name = os.environ['UPSTASH_TOKEN_SECRET_NAME']
    logger.info(f"Getting secret for token name: {token_name}")
    token_secret = secrets_client.get_secret_value(
        SecretId=token_name
    )

    if not endpoint_secret['SecretString'] or not token_secret['SecretString']:
        raise ValueError("Missing secret values")

    endpoint = endpoint_secret['SecretString']
    logger.info(f"Upstash Endpoint length: {len(endpoint)}")
    token = token_secret['SecretString']
    logger.info(f"Upstash Token length: {len(token)}")
    
    return endpoint, token


def create_sparse_vector(
    embeddings: List[float], 
    top_k: int = 32, 
    threshold: float = 0.1
) -> SparseVector:
    """Create sparse vector using both top-k and threshold with validation"""
    # Validate input
    if not embeddings:
        raise ValueError("Empty embeddings list")
    
    # Create indexed values and filter out NaN values
    indexed_values = [
        (i, v) for i, v in enumerate(embeddings) 
        if isinstance(v, float) and not math.isnan(v)  # Explicit NaN check using math.isnan()
    ]
    
    if not indexed_values:
        raise ValueError("No valid values in embeddings (all NaN)")
    
    # Filter by threshold and ensure positive values
    significant_values = [
        (i, abs(v)) for i, v in indexed_values 
        if abs(v) > threshold
    ]
    
    if not significant_values:
        # If no values meet threshold, take top k of absolute values
        significant_values = sorted(
            [(i, abs(v)) for i, v in indexed_values],
            key=lambda x: x[1],
            reverse=True
        )[:top_k]
    
    # Take top-k of remaining values
    top_indices = sorted(
        significant_values, 
        key=lambda x: x[1], 
        reverse=True
    )[:top_k]
    
    if not top_indices:
        raise ValueError("No significant values found in embeddings")
    
    indices = [i for i, _ in top_indices]
    values = [v for _, v in top_indices]
    
    # Validate final values
    if any(v <= 0 for v in values):
        raise ValueError("Negative or zero values in sparse vector")
    
    return SparseVector(indices, values)


def generate_bedrock_embeddings(
    client: BaseClient,
    text: str,
    model_id: str = None,
    dimensions: int = None
) -> List[float]:
    """Generate embeddings using Amazon Bedrock"""
    try:
        model_id = model_id or os.environ.get('BEDROCK_EMBEDDING_MODEL', 'amazon.titan-embed-text-v2:0')
        dimensions = dimensions or int(os.environ.get('EMBEDDING_DIMENSIONS', '512'))

        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "inputText": text,
                "dimensions": dimensions
            })
        )

        response_body = json.loads(response['body'].read())
        return response_body.get('embedding', [])

    except Exception as e:
        logger.error(f"Embedding generation error: {str(e)}")
        raise


def create_text_chunks(text: str, title: Optional[str] = None) -> List[str]:
    """Split text into chunks using RecursiveCharacterTextSplitter"""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,  # Approximately 512 tokens
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n## ", "\n# ", "\n### ", "\n\n", "\n", " ", ""]
    )
    
    # If text is short enough, return as single chunk
    if len(text) < CHUNK_SIZE:
        return [text]
    
    # Add title to beginning of text if provided
    if title:
        text = f"# {title}\n\n{text}"
    
    chunks = text_splitter.split_text(text)
    return chunks


def prepare_vector_item(
    item_data: Tuple[int, str, str],
    bedrock_client: BaseClient
) -> List[Tuple[Optional[Vector], Optional[str]]]:
    """Prepare vector items with embeddings generation and chunking"""
    idx, line, source_key = item_data
    try:
        item = ProcessedItem.model_validate(json.loads(line))

        # Check if we have valid content to generate embeddings
        if not item.markdown or len(item.markdown.strip()) == 0:
            if not item.description or len(item.description.strip()) == 0:
                raise ValueError("Both markdown and description are empty or None")
            text_for_embedding = item.description
        else:
            text_for_embedding = item.markdown

        # Split text into chunks
        chunks = create_text_chunks(text_for_embedding, item.title)
        vectors = []

        # Process each chunk
        for chunk_idx, chunk in enumerate(chunks):
            # Generate embeddings for chunk
            logger.info(f"Generating embeddings for item {idx + 1}, chunk {chunk_idx + 1}")
            embeddings = generate_bedrock_embeddings(
                bedrock_client,
                chunk
            )

            # Create sparse vector
            sparse_vector = create_sparse_vector(embeddings)
            sparsity = len(sparse_vector.indices) / len(embeddings)
            logger.info(f"Sparsity of output vector: {sparsity}")

            # Create unique vector ID incorporating chunk number
            vector_id = f"{source_key}_{idx}_{chunk_idx}"

            # Create the vector object with chunk metadata
            vector = Vector(
                id=vector_id,
                vector=embeddings,
                sparse_vector=sparse_vector,
                metadata={
                    "title": item.title,
                    "source_text": item.source_text,
                    "source_link": item.source_link,
                    "url": item.url,
                    "content_type": item.content_type,
                    "extracted_at": item.extracted_at.isoformat(),
                    "chunk_index": chunk_idx,
                    "total_chunks": len(chunks),
                    "parent_id": f"{source_key}_{idx}"
                },
                data=chunk
            )
            vectors.append((vector, None))

        return vectors

    except Exception as error:
        error_msg = str(error)
        logger.error(f"Error processing item {idx + 1}: {error_msg}")
        return [(None, error_msg)]


def process_batch(
    items: List[Tuple[int, str, str]],
    bedrock_client: BaseClient,
    index: Index,
    max_workers: int = 5
) -> Tuple[int, List[Dict[str, str]]]:
    """Process a batch of items in parallel and upsert as a single batch"""
    successful = 0
    failed = []
    vectors_to_upsert = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_item = {
            executor.submit(prepare_vector_item, item, bedrock_client): item
            for item in items
        }

        for future in as_completed(future_to_item):
            item = future_to_item[future]
            idx, _, source_key = item
            
            try:
                vector_results = future.result()
                for vector, error in vector_results:
                    if vector:
                        vectors_to_upsert.append(vector)
                        successful += 1
                    else:
                        failed.append({
                            "id": f"{source_key}_{idx}",
                            "error": error
                        })
            except Exception as error:
                failed.append({
                    "id": f"{source_key}_{idx}",
                    "error": str(error)
                })

    # Batch upsert all successful vectors
    if vectors_to_upsert:
        try:
            logger.info(f"Upserting batch of {len(vectors_to_upsert)} vectors")
            # Process in smaller sub-batches to avoid potential size limits
            batch_size = 50
            for i in range(0, len(vectors_to_upsert), batch_size):
                batch = vectors_to_upsert[i:i + batch_size]
                index.upsert(vectors=batch)
                logger.info(f"Upserted sub-batch of {len(batch)} vectors")
        except Exception as error:
            logger.error(f"Batch upsert error: {str(error)}")
            # If batch upsert fails, mark all vectors as failed
            successful = 0
            failed.extend([{
                "id": vector.id,
                "error": f"Batch upsert failed: {str(error)}"
            } for vector in vectors_to_upsert])

    return successful, failed


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for vectorization"""
    logger.info("Starting vectorization", extra={'event': event})

    # Initialize AWS clients
    s3_client = boto3.client('s3')
    secrets_client = boto3.client('secretsmanager')
    bedrock_client = boto3.client('bedrock-runtime')

    try:
        # Extract S3 event details
        record = event['Records'][0]['s3']
        source_bucket = record['bucket']['name']
        source_key = record['object']['key']

        # Retrieve and process S3 object
        logger.info(f"Retrieving object from {source_bucket}/{source_key}")
        response = s3_client.get_object(
            Bucket=source_bucket,
            Key=source_key
        )
        content = response['Body'].read().decode('utf-8')

        if not content:
            raise ValueError("No content found in S3 object")

        # Initialize Upstash Vector
        logger.info("Initializing Upstash")
        endpoint, token = get_upstash_credentials(secrets_client)
        index = Index(url=endpoint, token=token)

        # Process JSONL content
        result = ProcessingResult()
        lines = content.strip().split('\n')
        
        # Create batches of items
        batch_size = 10
        items = [(i, line, source_key) for i, line in enumerate(lines)]
        
        for batch_start in range(0, len(items), batch_size):
            if (len(result.failed) > len(items) * 0.1):
                logger.info("Stopping due to too many failed items")
                break
            batch = items[batch_start:batch_start + batch_size]
            logger.info(f"Processing batch {batch_start//batch_size + 1}")
            
            successful, failed = process_batch(batch, bedrock_client, index)
            result.successful += successful
            result.failed.extend(failed)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": f"Vectorization complete for {source_key}",
                "result": {
                    "total_items": len(lines),
                    "successful_items": result.successful,
                    "failed_items": result.failed
                }
            })
        }

    except Exception as error:
        logger.error(f"Vectorization error: {str(error)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "message": "Error in vectorization process",
                "error": str(error)
            })
        }
