# GCP Organization and Folder Structure for Enterprise CloudOps Platform
# Placeholder for Phase 7 (GCP Integration)

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

# Add IAM, Organization Policies, and default network configurations here.
