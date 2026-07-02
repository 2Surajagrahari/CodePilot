# ai-service/retriever.py
from sentence_transformers import CrossEncoder
import time

# Load the local reranker model into memory at startup
# BAAI/bge-reranker-base provides excellent accuracy for code and text retrieval
print("Loading local reranker model...")
reranker = CrossEncoder('BAAI/bge-reranker-base')
print("Reranker model loaded successfully.")

def run_hybrid_search(query: str, vector_results: list, bm25_results: list):
    """
    Combines Qdrant vector results and BM25 keyword results, 
    then scores them using a local Cross-Encoder.
    """
    start_time = time.time()
    
    # 1. Deduplicate results using a dictionary comprehension based on chunk IDs
    combined_chunks = {chunk['id']: chunk for chunk in vector_results + bm25_results}
    unique_chunks = list(combined_chunks.values())
    
    if not unique_chunks:
        return []

    # 2. Prepare the query-chunk pairs for the Cross-Encoder
    # Format required by the model: [[query, text1], [query, text2], ...]
    pairs = [[query, chunk['code_snippet']] for chunk in unique_chunks]
    
    # 3. Generate reranking scores locally
    scores = reranker.predict(pairs)
    
    # 4. Attach scores to chunks and sort them in descending order
    for idx, chunk in enumerate(unique_chunks):
        chunk['rerank_score'] = float(scores[idx])
        
    ranked_results = sorted(unique_chunks, key=lambda x: x['rerank_score'], reverse=True)
    
    # Calculate execution time to monitor the <5s requirement
    execution_time = time.time() - start_time
    print(f"Hybrid retrieval & reranking completed in {execution_time:.3f} seconds.")
    
    # 5. Return the top 5 most semantically relevant chunks
    return ranked_results[:5]