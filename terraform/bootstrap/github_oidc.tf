# GitHub Actions の OIDC の ID プロバイダー（強い権限の依頼 1 の操作 5 で作った）

import {
  to = aws_iam_openid_connect_provider.github_actions
  id = "arn:aws:iam::184403881528:oidc-provider/token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # GitHub が公開している証明書の指紋（秘密の値ではない）。作ったときのコマンドと同じ順。
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]

  # 誤った terraform destroy や、作り直しになる変更を plan の段階で止める
  lifecycle {
    prevent_destroy = true
  }
}
