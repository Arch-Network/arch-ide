#!/usr/bin/env python3
"""
Update an existing ECS service by registering a new task definition revision with:
- updated container image
- updated env vars (ARCH_NETWORK_* pins)

This is a pragmatic fallback for cases where Terraform state is missing/drifted and
terraform apply fails due to "already exists" or AWS account limits.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from typing import Any, Dict, List


def _run(cmd: List[str]) -> str:
    p = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return p.stdout


def _aws_json(cmd: List[str]) -> Dict[str, Any]:
    out = _run(cmd)
    return json.loads(out)


def _strip_taskdef(task_def: Dict[str, Any]) -> Dict[str, Any]:
    # Keep only register-task-definition compatible fields.
    allowed = {
        "family",
        "taskRoleArn",
        "executionRoleArn",
        "networkMode",
        "containerDefinitions",
        "volumes",
        "placementConstraints",
        "requiresCompatibilities",
        "cpu",
        "memory",
        "tags",
        "pidMode",
        "ipcMode",
        "proxyConfiguration",
        "inferenceAccelerators",
        "ephemeralStorage",
        "runtimePlatform",
    }
    return {k: v for k, v in task_def.items() if k in allowed and v is not None}


def _upsert_env(container: Dict[str, Any], updates: Dict[str, str]) -> None:
    env_list = container.get("environment") or []
    env_map = {e.get("name"): e.get("value") for e in env_list if isinstance(e, dict)}
    env_map.update({k: v for k, v in updates.items() if v is not None})
    container["environment"] = [{"name": k, "value": env_map[k]} for k in sorted(env_map.keys())]

def _upsert_secret(container: Dict[str, Any], name: str, value_from: str) -> None:
    secrets = container.get("secrets") or []
    # de-dupe by name
    secrets = [s for s in secrets if not (isinstance(s, dict) and s.get("name") == name)]
    secrets.append({"name": name, "valueFrom": value_from})
    container["secrets"] = secrets


def main() -> int:
    region = os.environ.get("REGION", "us-east-1")
    cluster = os.environ.get("ECS_CLUSTER", "arch-ide-cluster")
    service = os.environ.get("ECS_SERVICE", "arch-ide-server")
    image = os.environ.get("IMAGE_URI")

    if not image:
        print("ERROR: IMAGE_URI env var is required (e.g. 123.dkr.ecr.us-east-1.amazonaws.com/arch-ide/rust-server:latest)", file=sys.stderr)
        return 2

    arch_git = os.environ.get("ARCH_NETWORK_GIT", "")
    arch_rev = os.environ.get("ARCH_NETWORK_REV", "")
    arch_branch = os.environ.get("ARCH_NETWORK_BRANCH", "")
    github_token_secret_arn = os.environ.get("GITHUB_TOKEN_SECRET_ARN", "")

    # Determine current task definition ARN used by the service.
    svc = _aws_json(
        [
            "aws",
            "ecs",
            "describe-services",
            "--region",
            region,
            "--cluster",
            cluster,
            "--services",
            service,
        ]
    )
    services = svc.get("services") or []
    if not services or not services[0].get("taskDefinition"):
        print(f"ERROR: Could not find service task definition for {cluster}/{service}", file=sys.stderr)
        return 3
    current_td_arn = services[0]["taskDefinition"]

    td = _aws_json(
        [
            "aws",
            "ecs",
            "describe-task-definition",
            "--region",
            region,
            "--task-definition",
            current_td_arn,
        ]
    )
    task_def = td.get("taskDefinition")
    if not task_def:
        print("ERROR: describe-task-definition returned no taskDefinition", file=sys.stderr)
        return 4

    register_payload = _strip_taskdef(task_def)

    containers = register_payload.get("containerDefinitions") or []
    if not containers:
        print("ERROR: task definition has no containerDefinitions", file=sys.stderr)
        return 5

    # Heuristic: update the first container (the service's primary container).
    containers[0]["image"] = image

    env_updates = {}
    if arch_git:
        env_updates["ARCH_NETWORK_GIT"] = arch_git
    if arch_rev:
        env_updates["ARCH_NETWORK_REV"] = arch_rev
    if arch_branch:
        env_updates["ARCH_NETWORK_BRANCH"] = arch_branch

    if env_updates:
        _upsert_env(containers[0], env_updates)

    if github_token_secret_arn:
        _upsert_secret(containers[0], "GITHUB_TOKEN", github_token_secret_arn)

    # Register new revision.
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".json") as f:
        json.dump(register_payload, f)
        tf_path = f.name

    try:
        reg = _aws_json(
            [
                "aws",
                "ecs",
                "register-task-definition",
                "--region",
                region,
                "--cli-input-json",
                f"file://{tf_path}",
            ]
        )
    finally:
        try:
            os.unlink(tf_path)
        except OSError:
            pass

    new_td_arn = reg.get("taskDefinition", {}).get("taskDefinitionArn")
    if not new_td_arn:
        print("ERROR: register-task-definition did not return taskDefinitionArn", file=sys.stderr)
        return 6

    _run(
        [
            "aws",
            "ecs",
            "update-service",
            "--region",
            region,
            "--cluster",
            cluster,
            "--service",
            service,
            "--task-definition",
            new_td_arn,
        ]
    )

    print(new_td_arn)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
