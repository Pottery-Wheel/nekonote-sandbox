# Terraform の状態を置く S3 バケット（強い権限の依頼 1 の操作 1〜4 で作った）

# 操作 1：aws s3api create-bucket
import {
  to = aws_s3_bucket.tfstate
  id = "nekonote-sandbox-tfstate-184403881528"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "nekonote-sandbox-tfstate-184403881528"
}

# 操作 2：aws s3api put-public-access-block
import {
  to = aws_s3_bucket_public_access_block.tfstate
  id = "nekonote-sandbox-tfstate-184403881528"
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# 操作 3：aws s3api put-bucket-versioning
# expected_bucket_owner は書かない（書くと、バケット名だけで取り込んだ状態との差で作り直しになるため）。
import {
  to = aws_s3_bucket_versioning.tfstate
  id = "nekonote-sandbox-tfstate-184403881528"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# 操作 4：aws s3api put-bucket-encryption
# expected_bucket_owner は、上と同じ理由で書かない。
import {
  to = aws_s3_bucket_server_side_encryption_configuration.tfstate
  id = "nekonote-sandbox-tfstate-184403881528"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
