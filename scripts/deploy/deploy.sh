#!/bin/bash

# Deployment script for payment router

set -e

echo "Starting deployment..."

# Check environment
if [ -z "$ENVIRONMENT" ]; then
  echo "Error: ENVIRONMENT not set"
  exit 1
fi

# Build Docker images
echo "Building Docker images..."
docker build -t payment-router-api:latest -f infrastructure/docker/Dockerfile.api .
docker build -t payment-router-listener:latest -f infrastructure/docker/Dockerfile.listener .
docker build -t payment-router-router:latest -f infrastructure/docker/Dockerfile.router .
docker build -t payment-router-settlement:latest -f infrastructure/docker/Dockerfile.settlement .

# Deploy to Kubernetes
echo "Deploying to Kubernetes..."
kubectl apply -f infrastructure/k8s/configmaps/
kubectl apply -f infrastructure/k8s/services/
kubectl apply -f infrastructure/k8s/deployments/

# Wait for deployment
echo "Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/payment-router-api

echo "Deployment complete!"

