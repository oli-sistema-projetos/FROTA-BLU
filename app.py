from fastapi.staticfiles import StaticFiles

from backend.main import app


app.mount("/", StaticFiles(directory="dist", html=True), name="frontend")
