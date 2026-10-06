"""
Continuity — lecture continuity for a university department.

    uvicorn app.main:app --port 8000

The API is grouped by who uses it:
    /auth         signing in
    /dashboard    one dashboard per role
    /timetable    weeks and days
    /handover     handing a lecture over;  /cover  covering for a colleague
    /lectures     recording what was taught
    /syllabus     syllabus progress
    /insight      risk, recovery planning, load
    /admin        managing everything (administrators only)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.routers import admin, auth, dashboard, handover, insight, syllabus, timetable

app = FastAPI(title="Continuity", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, dashboard, timetable, handover, syllabus, insight, admin):
    app.include_router(module.router)


@app.get("/health")
def health():
    return {"status": "ok"}
