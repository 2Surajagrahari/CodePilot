# ai-service/graph_db.py
from neo4j import GraphDatabase

class CodeGraph:
    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def add_file_and_function(self, file_name, function_name):
        query = """
        MERGE (f:File {name: $file_name})
        MERGE (func:Function {name: $function_name})
        MERGE (f)-[:DEFINES]->(func)
        """
        with self.driver.session() as session:
            session.run(query, file_name=file_name, function_name=function_name)

# Initialize connection to the local Neo4j container from Milestone 1
# neo4j_client = CodeGraph("bolt://localhost:7687", "neo4j", "admin_password")