import os
import argparse
import requests

# Supported programming languages in get_splitter_for_language
SUPPORTED_EXTENSIONS = {
    '.py': 'python',
    '.js': 'javascript',
    '.ts': 'javascript',
    '.tsx': 'javascript',
    '.jsx': 'javascript',
    '.java': 'java',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.c': 'cpp',
    '.h': 'cpp'
}

IGNORED_DIRS = {
    '.git', 'node_modules', '.venv', 'venv', 'env', '__pycache__', 
    '.next', 'out', 'build', 'dist', '.gemini'
}

def ingest_directory(directory_path, repository_id, api_url):
    print(f"Reading files from: {directory_path}")
    files_to_ingest = []

    for root, dirs, files in os.walk(directory_path):
        # Skip ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, directory_path)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    if content.strip():
                        files_to_ingest.append({
                            "file_path": rel_path,
                            "content": content,
                            "language": SUPPORTED_EXTENSIONS[ext]
                        })
                except Exception as e:
                    print(f"Skipping {rel_path} due to error: {e}")

    if not files_to_ingest:
        print("No supported code files found to ingest.")
        return

    print(f"Found {len(files_to_ingest)} files. Sending to ingestion service...")
    
    payload = {
        "repository_id": repository_id,
        "files": files_to_ingest
    }

    try:
        response = requests.post(f"{api_url}/api/ingest", json=payload)
        if response.status_code == 200:
            print("Ingestion successful!")
            print(response.json().get("message"))
        else:
            print(f"Ingestion failed with status code {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Failed to connect to ingestion service: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest local codebase into CodePilot AI")
    parser.add_argument("--dir", default=".", help="Directory of the codebase to index (default: current directory)")
    parser.add_argument("--id", default="default", help="Repository identifier (default: 'default')")
    parser.add_argument("--url", default="http://localhost:8001", help="FastAPI microservice base URL")
    
    args = parser.parse_args()
    ingest_directory(os.path.abspath(args.dir), args.id, args.url)
