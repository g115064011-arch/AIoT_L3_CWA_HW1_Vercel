import os
import sys
from pathlib import Path

# Add project root directory to sys.path so weather_api can be imported seamlessly
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from weather_api import fetch_weather_forecast

app = FastAPI(
    title="Taiwan Weather Forecast API",
    description="Vercel-compatible FastAPI backend providing Taiwan CWA 36h weather forecast data.",
    version="1.0.0",
)

# Enable CORS for cross-origin requests during local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/weather")
def get_weather():
    """
    Fetch and return Taiwan 36-hour county/city weather forecast.
    Reuses fetch_weather_forecast() from weather_api.py.
    """
    try:
        data = fetch_weather_forecast()
        return {"data": data}
    except Exception as exc:
        error_msg = str(exc)
        # Ensure CWA API key is never leaked in error messages
        api_key = os.getenv("CWA_API_KEY", "")
        if api_key and api_key in error_msg:
            error_msg = error_msg.replace(api_key, "[REDACTED]")
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to fetch weather forecast",
                "detail": error_msg,
            },
        )


# Fallback static file handlers for local development with `uvicorn api.index:app`
@app.get("/")
def serve_index():
    index_file = ROOT_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Taiwan Weather Forecast API is running. Check /api/weather"}


@app.get("/style.css")
def serve_style():
    style_file = ROOT_DIR / "style.css"
    if style_file.exists():
        return FileResponse(style_file, media_type="text/css")
    return JSONResponse(status_code=404, content={"error": "style.css not found"})


@app.get("/app.js")
def serve_app_js():
    js_file = ROOT_DIR / "app.js"
    if js_file.exists():
        return FileResponse(js_file, media_type="application/javascript")
    return JSONResponse(status_code=404, content={"error": "app.js not found"})
