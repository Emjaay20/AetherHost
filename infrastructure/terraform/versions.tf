terraform {
  required_providers {
    alicloud = {
      source  = "aliyun/alicloud"
      version = "~> 1.214.0"
    }
  }

  # backend "oss" {
  #   bucket = "aetherhost-tf-state"
  #   key    = "control-plane/terraform.tfstate"
  #   region = "ap-southeast-1"
  # }
}
