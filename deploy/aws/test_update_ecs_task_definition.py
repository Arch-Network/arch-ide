#!/usr/bin/env python3
"""Regression: the ECS fallback must not reattach a task role or a GitHub token."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import update_ecs_task_definition as taskdef


def test_strips_token_and_task_role() -> None:
    task = {
        "family": "arch-ide-server",
        "taskRoleArn": "arn:aws:iam::590184001652:role/arch-ide-ecs-task",
        "executionRoleArn": "arn:aws:iam::590184001652:role/arch-ide-ecs-execution",
        "containerDefinitions": [
            {
                "name": "server",
                "secrets": [
                    {
                        "name": "GITHUB_TOKEN",
                        "valueFrom": "arn:aws:secretsmanager:us-east-1:590184001652:secret:github",
                    }
                ],
                "environment": [
                    {"name": "GH_TOKEN", "value": "present"},
                    {"name": "PORT", "value": "8080"},
                ],
            }
        ],
    }
    cleaned = taskdef.sanitize_task_definition(task)
    assert "taskRoleArn" not in cleaned
    assert cleaned["executionRoleArn"].endswith("arch-ide-ecs-execution")
    container = cleaned["containerDefinitions"][0]
    assert "secrets" not in container
    assert container["environment"] == [{"name": "PORT", "value": "8080"}]
    assert "GITHUB_TOKEN" not in str(cleaned)


if __name__ == "__main__":
    test_strips_token_and_task_role()
    print("ok")
