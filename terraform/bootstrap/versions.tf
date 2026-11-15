# terraform/bootstrap は、Terraform が動く前に要るもの（状態を置く S3 バケット、
# GitHub Actions の OIDC の ID プロバイダー、デプロイ用の IAM ロール）を管理する。
# アプリのための Terraform とはディレクトリを分け、CI では反映しない。
# 反映は、PR をマージした後に管理者が手元で行う。
#
# 状態（state）は、このディレクトリが管理する S3 バケットそのものに置く。
# ロックには S3 だけのロック（use_lockfile）を使うので、DynamoDB のテーブルは要らない。

terraform {
  # use_lockfile は Terraform 1.10 以降で使える。
  required_version = ">= 1.10.0"

  backend "s3" {
    bucket       = "nekonote-sandbox-tfstate-184403881528"
    key          = "bootstrap/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-1"

  # 別のアカウントの認証情報で誤って反映しないようにする。
  allowed_account_ids = ["184403881528"]
}
