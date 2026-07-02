from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
import uuid
from retriever import run_hybrid_search
import time

app = FastAPI(title="CodePilot AI Service")

# 1. Connect to the local Qdrant container running on port 6333
qdrant_client = QdrantClient(host="localhost", port=6333)

# 2. Load the embedding model
# We use all-MiniLM-L6-v2, a fast and efficient model that outputs 384-dimensional vectors
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
COLLECTION_NAME = "codepilot_chunks"

# 3. Ensure the Qdrant collection exists and is configured for Cosine Similarity
if not qdrant_client.collection_exists(COLLECTION_NAME):
    qdrant_client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=384, distance=Distance.COSINE)
    )

# --- Data Models ---
class FileData(BaseModel):
    file_path: str
    content: str
    language: str

class RepoUploadRequest(BaseModel):
    repository_id: str
    files: List[FileData]

class QueryRequest(BaseModel):
    query: str
    repository_id: str

# --- Chunking Logic ---
def get_splitter_for_language(lang_str: str):
    """
    Intelligently chunks code by respecting language-specific syntax boundaries 
    (like functions and classes) instead of arbitrary character counts.
    """
    lang_map = {
        "python": Language.PYTHON,
        "javascript": Language.JS,
        "java": Language.JAVA,
        "cpp": Language.CPP,
    }
    
    lang = lang_map.get(lang_str.lower())
    if lang:
        return RecursiveCharacterTextSplitter.from_language(
            language=lang, chunk_size=500, chunk_overlap=50
        )
    
    # Fallback for unsupported/generic text files
    return RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)

# --- Ingestion Endpoint ---
@app.post("/api/ingest")
async def ingest_repository(request: RepoUploadRequest):
    points = []
    
    for file in request.files:
        # Break the file down into semantically meaningful chunks
        splitter = get_splitter_for_language(file.language)
        chunks = splitter.split_text(file.content)
        
        for chunk in chunks:
            # Convert the code chunk into a dense vector embedding
            vector = embedding_model.encode(chunk).tolist()
            
            # Prepare the payload (metadata) for future hybrid retrieval
            payload = {
                "repository_id": request.repository_id,
                "file_path": file.file_path,
                "code_snippet": chunk,
                "language": file.language
            }
            
            # Construct the point struct required by Qdrant
            points.append(PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload=payload
            ))
            
    if points:
        # Batch insert the vectors into the Qdrant collection
        qdrant_client.upsert(
            collection_name=COLLECTION_NAME,
            points=points
        )
        return {"message": f"Successfully ingested {len(points)} chunks into Qdrant."}
    
    raise HTTPException(status_code=400, detail="No code chunks generated.")

    # Append this to main.py
@app.post("/api/search")
async def search_codebase(request: QueryRequest):
    start_time = time.time()
    
    # 1. Convert the user's question into a vector embedding
    query_vector = embedding_model.encode(request.query).tolist()
    
    qdrant_results = qdrant_client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        query_filter={
            "must": [{"key": "repository_id", "match": {"value": request.repository_id}}]
        },
        limit=20
    ).points
    
    # Format Qdrant results to match our expected dictionary structure
    vector_chunks = [
        {
            "id": hit.id, 
            "code_snippet": hit.payload["code_snippet"], 
            "file_path": hit.payload["file_path"],
            "source": "vector"
        } 
        for hit in qdrant_results
    ]
    
    # 3. Keyword Search (BM25)
    # Note: In a full production setup, you would query your persistent Elasticsearch/BM25 instance here.
    # For now, we simulate the output structure.
    bm25_chunks = [] 
    
    # 4. Fusion & Local Reranking
    # Pass the raw results to the BGE-Reranker model we built in retriever.py
    top_ranked_chunks = run_hybrid_search(
        query=request.query, 
        vector_results=vector_chunks, 
        bm25_results=bm25_chunks
    )
    
    execution_time = time.time() - start_time
    
    # 5. Return the payload
    return {
        "query": request.query,
        "execution_time_seconds": round(execution_time, 3),
        "results": top_ranked_chunks
    }

@app.get("/api/stats")
async def get_stats():
    try:
        count_res = qdrant_client.count(collection_name=COLLECTION_NAME)
        total_chunks = count_res.count
    except Exception as e:
        total_chunks = 0
    return {
        "total_chunks": total_chunks,
        "collection_name": COLLECTION_NAME
    }