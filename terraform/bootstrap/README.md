# terraform/bootstrap

Terraform が動く前に要るもの（AWS アカウント 184403881528、リージョン ap-northeast-1）を管理する。

- Terraform の状態を置く S3 バケット `nekonote-sandbox-tfstate-184403881528`（バージョニング、公開のアクセスの停止、SSE-S3 の既定の暗号化）
- GitHub Actions の OIDC の ID プロバイダー `token.actions.githubusercontent.com`
- デプロイ用の IAM ロール `nekonote-sandbox-prod-deploy`（権限のポリシーは無し）

どれも強い権限で一度だけ作ったもので、ここでは import ブロックで取り込む。

- アプリのための Terraform とはディレクトリを分ける（アプリを反映する CI に IAM などの権限を持たせないため）。
- CI では反映しない。PR をマージした後に、管理者が手元で `terraform init`・`terraform plan`・`terraform apply` を行う。
- 認証情報は、ファイルには書かない。管理者の手元の AWS の認証情報（プロファイルや SSO など）を使う。
