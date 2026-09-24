variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "api_image" {
  type        = string
  description = "Docker image tag for the control plane API"
  default     = "registry.ap-southeast-1.aliyuncs.com/aetherhost/api:latest"
}
