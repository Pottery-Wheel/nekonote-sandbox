# デプロイ用の IAM ロール（強い権限の依頼 1 の操作 6 で作った）
# nekonote-sandbox の prod の Environment からのジョブだけが引き受けられる。
# 権限のポリシーは、まだ付けていない。

import {
  to = aws_iam_role.prod_deploy
  id = "nekonote-sandbox-prod-deploy"
}

resource "aws_iam_role" "prod_deploy" {
  name                 = "nekonote-sandbox-prod-deploy"
  description          = "Deploy role for Pottery-Wheel/nekonote-sandbox prod environment via GitHub Actions OIDC"
  max_session_duration = 3600

  # 作ったときのコマンドと同じ内容。ARN は取り込んだ OIDC プロバイダーから参照する
  # （値は arn:aws:iam::184403881528:oidc-provider/token.actions.githubusercontent.com で同じ）。
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:Pottery-Wheel/nekonote-sandbox:environment:prod"
          }
        }
      }
    ]
  })
}
