from fastapi import FastAPI
from pydantic import BaseModel
from google import genai

with open("Gemini Api Key.txt") as f:
    key = f.read().split()[-1].strip()

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


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def root():
    return {"status": "running"}


@app.post("/chat")
def chat(req: ChatRequest):

    try:

        prompt = f"""
You are an AI assistant for an Industrial Predictive Maintenance Dashboard.

Only answer questions related to the dashboard, sensors,
Asset Health Index (AHI), website usage, troubleshooting,
and predictive maintenance.

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