"""# PoC — NOT production. Cosmoport boundary. Do not import into DAST runtime.
COS-B3: FastAPI CRUD API для Cosmoport Domain Model.

Эндпоинты:
  POST   /api/cosmo/domains          — создать КИТС
  GET    /api/cosmo/domains/{id}/graph — App Graph
  POST   /api/cosmo/applications     — создать приложение Level 1
  POST   /api/cosmo/groups           — создать группу Level 2
  PUT    /api/cosmo/applications/{id}/repo-binding — привязать Git-репо
  GET    /api/cosmo/ladder?project_id=X — CosmoLadder (COS-B5)

Использует Pydantic-модели из orchestrator/models/.
Рантайм-хранилище — in-memory (слой FastAPI не привязан к БД;
БД-уровень через SQLAlchemy в orchestrator/db/models.py).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

try:
    from fastapi import FastAPI, HTTPException, Query
    from pydantic import BaseModel, Field
except ImportError:
    FastAPI = object  # type: ignore
    HTTPException = Exception  # type: ignore
    BaseModel = object  # type: ignore
    Field = lambda **kw: None  # type: ignore
    Query = lambda **kw: None  # type: ignore

try:
    from models.domain_model import Domain, DomainQuota, ForgeBinding
    from models.app_graph import AppGraph, Application, Group, RepositoryBinding
except ImportError:
    Domain = DomainQuota = ForgeBinding = object  # type: ignore
    AppGraph = Application = Group = RepositoryBinding = object  # type: ignore

# ---------------------------------------------------------------------------
# In-memory store (for COS-B3 PoC; replace with PostgreSQL via SQLAlchemy)
# ---------------------------------------------------------------------------

_domains: dict[str, Domain] = {}
_apps: dict[str, Application] = {}
_groups: dict[str, Group] = {}

app = FastAPI(title="PrettyK Cosmoport API", version="0.1.0")

# HEALTH-1/2: /live /ready /health (profile-aware, draining-aware)
try:
    from api.health_routes import register_health_routes
    register_health_routes(app)
except Exception:  # pragma: no cover — health-роуты не должны ломать API
    pass


# ── Domain CRUD ────────────────────────────────────────────────────────────


class CreateDomainRequest(BaseModel):
    id: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    forge_type: str = Field(default="gitea")
    forge_url: str = Field(..., min_length=1)
    forge_token_ref: str = Field(..., min_length=1)


@app.post("/api/cosmo/domains")
def create_domain(body: CreateDomainRequest):
    if body.id in _domains:
        raise HTTPException(409, f"Domain {body.id} already exists")
    domain = Domain(
        id=body.id,
        label=body.label,
        forge_binding=ForgeBinding(
            forge_type=body.forge_type,
            url=body.forge_url,
            token_ref=body.forge_token_ref,
        ),
    )
    _domains[body.id] = domain
    return {"ok": True, "domain": domain.model_dump()}


@app.get("/api/cosmo/domains/{domain_id}")
def get_domain(domain_id: str):
    d = _domains.get(domain_id)
    if d is None:
        raise HTTPException(404, f"Domain {domain_id} not found")
    return {"ok": True, "domain": d.model_dump()}


@app.get("/api/cosmo/domains/{domain_id}/graph")
def get_domain_graph(domain_id: str):
    if domain_id not in _domains:
        raise HTTPException(404, f"Domain {domain_id} not found")
    apps = [a for a in _apps.values() if a.domain_id == domain_id and a.level >= 1]
    libs = [a for a in _apps.values() if a.domain_id == domain_id and a.level == 0]
    grps = [g for g in _groups.values() if g.domain_id == domain_id]
    graph = AppGraph(domain=domain_id, apps=apps, libraries=libs, groups=grps)
    return {"ok": True, "graph": graph.model_dump()}


# ── Application CRUD ───────────────────────────────────────────────────────


class CreateApplicationRequest(BaseModel):
    id: str = Field(..., min_length=1)
    domain_id: str = Field(..., min_length=1)
    level: int = Field(default=1, ge=0, le=3)
    group_id: Optional[str] = None
    repo_forge_id: str = Field(default="", min_length=1)
    repo_path: str = Field(default="", min_length=1)


@app.post("/api/cosmo/applications")
def create_application(body: CreateApplicationRequest):
    if body.id in _apps:
        raise HTTPException(409, f"Application {body.id} already exists")
    if body.domain_id not in _domains:
        raise HTTPException(404, f"Domain {body.domain_id} not found")
    binding = RepositoryBinding(forge_id=body.repo_forge_id, repo_path=body.repo_path)
    app_obj = Application(
        id=body.id,
        domain_id=body.domain_id,
        level=body.level,
        group_id=body.group_id,
        repo_binding=binding,
    )
    _apps[body.id] = app_obj
    return {"ok": True, "app": app_obj.model_dump()}


# ── Group CRUD ─────────────────────────────────────────────────────────────


class CreateGroupRequest(BaseModel):
    id: str = Field(..., min_length=1)
    domain_id: str = Field(..., min_length=1)
    parent_group_id: Optional[str] = None
    level: int = Field(default=2, ge=0, le=3)
    name: str = Field(..., min_length=1)


@app.post("/api/cosmo/groups")
def create_group(body: CreateGroupRequest):
    if body.id in _groups:
        raise HTTPException(409, f"Group {body.id} already exists")
    if body.domain_id not in _domains:
        raise HTTPException(404, f"Domain {body.domain_id} not found")
    grp = Group(
        id=body.id,
        domain_id=body.domain_id,
        parent_group_id=body.parent_group_id,
        level=body.level,
        name=body.name,
    )
    _groups[body.id] = grp
    return {"ok": True, "group": grp.model_dump()}


# ── Repo Binding ───────────────────────────────────────────────────────────


class PutRepoBindingRequest(BaseModel):
    forge_id: str = Field(..., min_length=1)
    repo_path: str = Field(..., min_length=1)
    default_branch: str = Field(default="main")


@app.put("/api/cosmo/applications/{app_id}/repo-binding")
def put_repo_binding(app_id: str, body: PutRepoBindingRequest):
    app_obj = _apps.get(app_id)
    if app_obj is None:
        raise HTTPException(404, f"Application {app_id} not found")
    app_obj.repo_binding.forge_id = body.forge_id
    app_obj.repo_binding.repo_path = body.repo_path
    app_obj.repo_binding.default_branch = body.default_branch
    return {"ok": True, "binding": app_obj.repo_binding.model_dump()}


# ── COS-B5: CosmoLadder API ───────────────────────────────────────────────


@app.get("/api/cosmo/ladder")
def cosmo_ladder(project_id: str = Query(...)):
    """Get Cosmo ladder: app → builds → deploys → URLs."""
    app_obj = _apps.get(project_id)
    if app_obj is None:
        raise HTTPException(404, f"Project {project_id} not found")
    return {
        "app": app_obj.id,
        "domain_id": app_obj.domain_id,
        "builds": [
            {
                "version": "v2.1.0 (mock)",
                "status": "passed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
        "deploys": [
            {
                "env": "stage",
                "status": "deployed",
                "url": f"https://stage.{app_obj.id}.local",
            }
        ],
    }