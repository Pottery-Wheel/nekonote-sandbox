# terraform/bootstrap

Terraform が動く前に要るもの（AWS アカウント 184403881528、リージョン ap-northeast-1）を管理する。

- Terraform の状態を置く S3 バケット `nekonote-sandbox-tfstate-184403881528`（バージョニング、公開のアクセスの停止、SSE-S3 の既定の暗号化）
- GitHub Actions の OIDC の ID プロバイダー `token.actions.githubusercontent.com`
- デプロイ用の IAM ロール `nekonote-sandbox-prod-deploy`（権限のポリシーは無し）

どれも強い権限で一度だけ作ったもので、ここでは import ブロックで取り込む。

- アプリのための Terraform とはディレクトリを分ける（アプリを反映する CI に IAM などの権限を持たせないため）。
- CI では反映しない。PR をマージした後に、管理者が手元で `terraform init`・`terraform plan`・`terraform apply` を行う。
- 認証情報は、ファイルには書かない。管理者の手元の AWS の認証情報（プロファイルや SSO など）を使う。
- 状態（state）は、このディレクトリが管理する S3 バケット `nekonote-sandbox-tfstate-184403881528` の `bootstrap/terraform.tfstate` に置く。ロックは S3 だけのロック（`use_lockfile`）を使うので、Terraform 1.10 以降が要る。
- `terraform destroy` は実行しない。GitHub Actions が AWS に入るための OIDC の ID プロバイダーとロールが消え、状態を置いているバケットのバージョニングと公開のアクセスの停止は元に戻される（バケットそのものは、中に状態があるので消えない）。このディレクトリのリソースには `lifecycle { prevent_destroy = true }` を付ける（新しく足すリソースにも付ける）。`destroy` や、作り直しになる変更は plan の段階で止まる。ただし、resource のブロックをコードから消した場合は止まらない。また、止まるのは Terraform からの削除だけで、AWS の画面や CLI からの削除は止まらない。このディレクトリの管理から外すときは、resource のブロックを `removed` ブロック（`lifecycle { destroy = false }`）に置き換え、対応する `import` ブロックも消す。
