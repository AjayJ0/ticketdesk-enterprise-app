# TicketDesk Enterprise — Local & AWS Cloud Deployment Guide

## 1. Local Docker Compose Deployment

To run PostgreSQL 16, the FastAPI backend, and the React Vite frontend together in containers:

```bash
cp .env.example .env
docker compose up --build -d
```

- **Frontend Application**: `http://localhost:5173`
- **Backend API & Swagger Docs**: `http://localhost:8000/docs`
- **Backend Health Check**: `http://localhost:8000/health`

## 2. Database Migrations (Alembic)

Run database migrations inside the `backend/` directory:

```bash
cd backend
alembic upgrade head
```

## 3. AWS Cloud Deployment Guide (EC2 + RDS + S3 + Lambda + CloudWatch)

### Step 1: Amazon RDS for PostgreSQL
1. Provision an **Amazon RDS PostgreSQL 16** instance inside private subnets.
2. Allow inbound TCP `5432` from the EC2 Security Group only.
3. Configure `DATABASE_URL` on EC2:
   ```ini
   DATABASE_URL=postgresql+psycopg://<db_user>:<db_password>@<rds-endpoint>:5432/ticketdesk_db
   ```

### Step 2: Amazon S3 Private Attachment Bucket & IAM Role
1. Create a private S3 bucket (e.g., `ticketdesk-enterprise-attachments-prod`) with **Block All Public Access** enabled and **SSE-S3 (AES-256)** encryption.
2. Attach an **IAM Instance Profile** to your EC2 instance with least-privilege permissions (`s3:PutObject`, `s3:GetObject` on `arn:aws:s3:::ticketdesk-enterprise-attachments-prod/*`). Never hardcode AWS access keys on the server.
3. Set environment variables on the backend:
   ```ini
   APP_ENV=production
   STORAGE_PROVIDER=s3
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=ticketdesk-enterprise-attachments-prod
   S3_PRESIGNED_URL_EXPIRATION=3600
   ```

### Step 3: AWS Lambda S3 File Processor & CloudWatch Logs
1. Package `lambda/file_processor/handler.py` into an AWS Lambda function (`python3.12` runtime, handler `handler.lambda_handler`).
2. Configure an **Amazon S3 Event Notification** on your attachment bucket for `s3:ObjectCreated:*` events targeting the Lambda function.
3. Attach the `AWSLambdaBasicExecutionRole` managed policy so the function writes structured JSON processing logs (`bucket`, `object_key`, `file_size_bytes`, `status`) directly to **Amazon CloudWatch Logs**.
