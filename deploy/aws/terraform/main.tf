provider "aws" {
  region = var.region
}

resource "aws_vpc" "this" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "${var.service_name}-vpc" }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = "10.20.${count.index + 1}.0/24"
  availability_zone = "${var.region}${count.index == 0 ? "a" : "b"}"
  tags = { Name = "${var.service_name}-public-${count.index + 1}" }
}

resource "aws_security_group" "alb" {
  name        = "${var.service_name}-alb"
  description = "ALB SG"
  vpc_id      = aws_vpc.this.id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "${var.service_name}-ecs"
  description = "ECS tasks"
  vpc_id      = aws_vpc.this.id
  ingress {
    from_port       = var.port
    to_port         = var.port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
}

# Public route table with default route to the Internet Gateway
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
}

# Associate public subnets with the public route table
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_lb" "this" {
  name               = "${var.service_name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 300  # 5 minutes for long-running builds
}

resource "aws_lb_target_group" "http" {
  name        = "${var.service_name}-tg"
  port        = var.port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id
  deregistration_delay = 300
  health_check {
    path    = "/health"
    matcher = "200-499"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.http.arn
  }
}

resource "aws_lb_listener" "https" {
  count             = var.https_certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.https_certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.http.arn
  }
}

resource "aws_ecs_cluster" "this" {
  name = "${var.service_name}-cluster"
}

resource "aws_cloudwatch_log_group" "server" {
  name              = "/ecs/${var.service_name}-server"
  retention_in_days = 14
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${var.service_name}-ecs-execution"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}

resource "aws_iam_role_policy_attachment" "ecs_exec_attach" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name               = "${var.service_name}-ecs-task"
  assume_role_policy = aws_iam_role.ecs_execution.assume_role_policy
}

resource "aws_ecs_task_definition" "server" {
  family                   = "${var.service_name}-server"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "server"
      image = var.rust_server_image
      portMappings = [{ containerPort = var.port, hostPort = var.port, protocol = "tcp" }]
      environment = [
        { name = "PORT", value = tostring(var.port) },
        { name = "CLIENT_URL", value = "https://ide.arch.network" },
        { name = "VERBOSE", value = "1" }
      ]
      logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.server.name, awslogs-region = var.region, awslogs-stream-prefix = "ecs" } }
      healthCheck = { command = ["CMD-SHELL", "curl -f http://localhost:${var.port}/health || exit 1"], interval = 30, timeout = 5, retries = 3, startPeriod = 30 }
    }
  ])
}

resource "aws_ecs_service" "server" {
  name            = "${var.service_name}-server"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.server.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = aws_subnet.public[*].id
    security_groups = [aws_security_group.ecs.id]
    assign_public_ip = true
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.http.arn
    container_name   = "server"
    container_port   = var.port
  }
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}
