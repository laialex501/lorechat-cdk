import json
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import boto3
import lxml.html
from pydantic import BaseModel, Field
from trafilatura import extract

# Configure logging
logger = logging.getLogger()
logger.setLevel(os.environ.get('LOG_LEVEL', 'INFO'))


class ProcessingError(Exception):
    """Custom exception for processing errors with context"""
    def __init__(self, message: str, details: dict = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


class ExtractedContent(BaseModel):
    """Model for extracted content"""
    title: Optional[str] = None
    source_text: Optional[str] = None
    source_link: Optional[str] = None
    description: Optional[str] = None
    url: str
    content_type: Optional[str] = None
    extracted_at: datetime = Field(default_factory=datetime.now)
    markdown: Optional[str] = None


def _get_text(element, xpath='.//text()'):
    """Safely extract text from an element"""
    if element is not None:
        texts = element.xpath(xpath)
        return ' '.join(t.strip() for t in texts if t.strip())
    return None


def _get_source(element) -> Tuple[Optional[str], Optional[str]]:
    """Extract source text and link.
    
    Returns:
        Tuple of (source_text, source_link)
    """
    if element is not None:
        # Get the "Source" text and following content up to the next tag
        source_text = element.xpath('.//b[contains(text(), "Source")]/following-sibling::a[1]/i/text()')
        # Get the linked source text
        source_link = element.xpath('.//b[contains(text(), "Source")]/following-sibling::a[1]/@href')
        
        if source_text and source_link:
            return (
                source_text[0].strip(),
                f"https://2e.aonprd.com/{source_link[0].strip()}"
            )
    return None, None


def _generate_fallback_markdown(title: str, source_text: str, source_link: str, description: str) -> str:
    """Generate markdown from extracted components when trafilatura fails"""
    parts = []
    
    # Add title as h1
    if title:
        parts.append(f"# {title}\n")
    
    # Add source with link
    if source_text and source_link:
        parts.append(f"**Source** *[{source_text}]({source_link})*\n")
    
    # Clean up and add description
    if description:
        # Remove navigation elements
        clean_desc = description.split("Quick display options:")[0].strip()
        # Remove "Click here" text
        clean_desc = re.sub(r'Click here[^.]*\.', '', clean_desc)
        parts.append(clean_desc)
    
    return "\n".join(parts)


def extract_with_fallback(
    html_content: str,
    title: str,
    source_text: str,
    source_link: str,
    description: str
) -> str:
    """Process HTML with trafilatura with fallback"""
    # Try to extract content using trafilatura
    markdown = extract(html_content, output_format='markdown', deduplicate=True)
    
    if not markdown or markdown is False:
        # Fallback: Create basic markdown with available metadata
        print("Trafilatura failed. Using fallback.")
        markdown = _generate_fallback_markdown(title, source_text, source_link, description)
    
    return markdown


def process_html_content(html_content: str, url: str) -> ExtractedContent:
    """Process HTML content and extract structured data"""
    try:
        tree = lxml.html.fromstring(html_content)
    except Exception as e:
        raise ValueError(f"Failed to parse HTML: {str(e)}")
    
    # Get main div
    main_div = tree.xpath('//div[@class="main"]')
    if not main_div or len(main_div) == 0:
        raise ValueError("No main div found")
    main = main_div[0]
    
    # Convert to string for trafilatura
    main_html = lxml.etree.tostring(
        main, encoding='unicode', method='html'
    )
    
    # Find spans
    spans = main.xpath('.//span[contains(@id, "MainContent_")]')
    span_dict = {}
    
    # Categorize spans
    for span in spans:
        span_id = span.get('id', '')
        if span_id.endswith('Header'):
            span_dict['header'] = span
        elif span_id.endswith('HeaderDescrip'):
            span_dict['description'] = span
        elif span_id.endswith('DetailedOutput'):
            span_dict['content'] = span
    
    # Extract content
    title = _get_text(span_dict.get('header'), './/h1/text()')
    source_text, source_link = _get_source(span_dict.get('description'))
    description = _get_text(span_dict.get('description'))
    content_type = re.search(
        r'/([^/]+)\.aspx',
        url.strip()
    ).group(1)
    
    # Generate markdown
    markdown = extract_with_fallback(
        main_html, title, source_text, source_link, description
    )
    
    return ExtractedContent(
        title=title.strip() if len(title.strip()) > 0 else None,
        source_text=source_text,
        source_link=source_link,
        description=description,
        url=url.strip(),
        content_type=content_type,
        extracted_at=datetime.now().isoformat(),
        markdown=markdown
    )


def parse_jsonl(content: str):
    for line_num, line in enumerate(content.splitlines(), 1):
        line = line.strip()
        if not line:  # Skip empty lines
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError as e:
            print(f"Invalid JSON at line {line_num}: {e}")
            continue


def handle_processing_error(error: Exception, context: dict = None) -> Dict[str, Any]:
    """Centralized error handling with structured logging"""
    error_context = {
        'error_type': error.__class__.__name__,
        'error_message': str(error),
        'context': context or {}
    }
    
    if isinstance(error, ProcessingError):
        error_context.update(error.details)
    
    logger.error("Processing error", extra=error_context)
    
    return {
        'statusCode': 500,
        'body': json.dumps({
            'message': 'Error processing data',
            'error': error_context
        })
    }


def process_items(content: str, is_jsonl: bool, source_key: str) -> Tuple[List[Dict], List[Dict]]:
    """Process items with structured error handling"""
    processed_items: List[ExtractedContent] = []
    failed_items: List[Dict] = []
    item_count = 0
    
    if is_jsonl:
        logger.info("Starting JSONL file processing")
        
        for idx, item in enumerate(parse_jsonl(content)):
            try:
                if not all(k in item for k in ('content', 'url')):
                    raise ProcessingError("Missing required fields", {
                        'item_index': idx,
                        'available_fields': list(item.keys())
                    })
                
                logger.info(f"Processing item {idx}: {item['url']}")
                processed: ExtractedContent = process_html_content(item['content'], item['url'])
                processed_items.append(processed)
                item_count += 1
                
                if item_count % 100 == 0:
                    logger.info(f"Processed {item_count} items")
                
            except Exception as e:
                error_details = {
                    'item_index': idx,
                    'url': item.get('url', 'unknown'),
                    'error': str(e)
                }
                logger.warning(f"Failed to process item {item}", extra=error_details)
                failed_items.append(error_details)
    else:
        try:
            processed_items = [process_html_content(content, source_key)]
        except Exception as e:
            failed_items.append({
                'url': source_key,
                'error': str(e)
            })
    
    logger.info(f"Completed processing with {len(processed_items)} successful items")
    return processed_items, failed_items


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler for processing HTML content with improved error handling"""
    logger.info("Processing request", extra={'event': event})
    s3 = boto3.client('s3')
    
    try:
        # Extract S3 event details
        record = event['Records'][0]['s3']
        source_bucket = record['bucket']['name']
        source_key = record['object']['key']
        
        # Get source object
        response = s3.get_object(Bucket=source_bucket, Key=source_key)
        content = response['Body'].read().decode('utf-8')
        
        # Process content
        is_jsonl = source_key.endswith('.jsonl')
        processed_items, failed_items = process_items(content, is_jsonl, source_key)
        
        if not processed_items:
            raise ProcessingError("No items were successfully processed", {
                'total_failures': len(failed_items),
                'failed_items': failed_items
            })
        
        # Write to processed bucket
        processed_bucket = os.environ['PROCESSED_BUCKET_NAME']
        date_prefix = datetime.now().strftime('%Y-%m-%d')
        output_key = f"processed/{date_prefix}/processed.jsonl"
        
        output_content = '\n'.join(json.dumps(item) for item in processed_items)
        s3.put_object(
            Bucket=processed_bucket,
            Key=output_key,
            Body=output_content.encode('utf-8'),
            ContentType='application/jsonl'
        )
        
        result = {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Processing complete',
                'processed_items': len(processed_items),
                'failed_items': len(failed_items),
                'output_location': f"s3://{processed_bucket}/{output_key}",
                'failures': failed_items if failed_items else None
            })
        }
        
        logger.info("Processing completed successfully", extra={
            'processed_count': len(processed_items),
            'failed_count': len(failed_items)
        })
        
        return result
        
    except Exception as e:
        return handle_processing_error(e, {
            'source_bucket': source_bucket,
            'source_key': source_key
        })
