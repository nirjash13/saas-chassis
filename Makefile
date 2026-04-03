.PHONY: up down restart logs ps migrate seed clean health

# Start all infrastructure
up:
	docker compose up -d
	@echo "Infrastructure running"
	@echo "  PostgreSQL:  localhost:5432"
	@echo "  Redis:       localhost:6379"
	@echo "  RabbitMQ:    localhost:15672 (UI)"
	@echo "  Seq:         localhost:5342 (UI)"
	@echo "  pgAdmin:     localhost:5050"

# Stop everything
down:
	docker compose down

# Restart infrastructure
restart:
	docker compose down && docker compose up -d

# Tail logs
logs:
	docker compose logs -f

# Show running containers
ps:
	docker compose ps

# Run Flyway migrations for all schemas
migrate:
	docker compose --profile migrate up flyway

# Wipe all data (development only)
clean:
	docker compose down -v
	@echo "All volumes removed"

# Health check
health:
	@echo "PostgreSQL:" && docker compose exec postgres pg_isready -U chassis_admin -d saas_chassis
	@echo "Redis:" && docker compose exec redis redis-cli -a redis_local_pwd ping
	@echo "RabbitMQ:" && docker compose exec rabbitmq rabbitmq-diagnostics check_port_connectivity
