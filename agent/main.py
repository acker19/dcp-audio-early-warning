from fastapi import FastAPI
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
import os

load_dotenv()

key = os.getenv("GEMINI_API_KEY")

if not key:
    raise ValueError("GEMINI_API_KEY not found in environment variables.")

client = genai.Client(api_key=key)

app = FastAPI()

docs = ""

for file in [
    "FAQ.txt",
    "website_manual.txt",
    "sensor_setup.txt",
    "ahi_explanation.txt",
    "troubleshooting.txt",
    "live_data_guide.txt"
]:
    with open(file, "r", encoding="utf-8") as f:
        docs += f.read() + "\n"

print("Documentation loaded.")
print(f"Characters loaded: {len(docs)}")


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def root():
    return {"status": "running"}


@app.post("/chat")
def chat(req: ChatRequest):

    try:

        prompt = f"""
        You are the support assistant for an Industrial Predictive Maintenance Dashboard.

        Rules:
        1. Answer ONLY using the provided documentation.
        2. Only answer questions about:
        - Asset Health Index (AHI)
        - Sensors and sensor setup
        - Dashboard usage
        - Predictive maintenance
        - Troubleshooting
        - Live monitoring data
        3. If the answer is not contained in the documentation, reply:

        "I do not have information about that in the system documentation."

        Documentation:
        {docs}

        User Question:
        {req.message}
        """

        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt
        )

        return {
            "answer": response.text
        }

    except Exception as e:

        return {
            "error": str(e)
        }