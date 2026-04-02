package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
	RabbitMQURL string
}

func Load() *Config {
	return &Config{
		Port:        getEnv("PORT", "3005"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://chassis_app:chassis_app_pwd@localhost:5432/saas_chassis"),
		RabbitMQURL: getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
