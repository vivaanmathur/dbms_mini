"""Everything under /admin. Every route here requires the ADMIN role."""
from fastapi import APIRouter

from app.routers.admin import classes, people, setup, timetable

router = APIRouter(prefix="/admin", tags=["Administration"])
router.include_router(setup.router)
router.include_router(classes.router)
router.include_router(people.router)
router.include_router(timetable.router)
