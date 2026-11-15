# terraform/bootstrap は、Terraform が動く前に要るもの（状態を置く S3 バケット、
# GitHub Actions の OIDC の ID プロバイダー、デプロイ用の IAM ロール）を管理する。
# アプリのための Terraform とはディレクトリを分け、CI では反映しない。
# 反映は、PR をマージした後に管理者が手元で行う。
#
# 状態（state）の置き場所（backend）は、まだ決まっていない（PR の「確かめが要る点」を参照）。
# backend を書いていないので、今は terraform を実行したディレクトリのローカルの
# terraform.tfstate に置かれる。

terraform {
  # import ブロックは Terraform 1.5 以降で使える。
  required_version = ">= 1.5.0"

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
