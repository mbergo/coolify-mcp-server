# frozen_string_literal: true

# ---------------------------------------------------------
#  Homebrew formula — coolify-11d
#
#  Stretch / stretch-goal: activated once a GitHub release
#  tarball is published. Until then the URL + sha256 below
#  are placeholders.
#
#  brew tap v3ct0r/coolify-11d <repo-url>
#  brew install coolify-11d
# ---------------------------------------------------------
class Coolify11d < Formula
  desc "CLI, MCP server, and Claude.ai connector for self-hosted Coolify"
  homepage "https://github.com/mbergo/coolify-mcp-server"
  license "MIT"
  head "https://github.com/mbergo/coolify-mcp-server.git", branch: "main"

  # TODO: replace on first tagged release
  url "https://github.com/mbergo/coolify-mcp-server/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  version "0.1.0"

  depends_on "node@22"

  def install
    system "npm", "ci", "--no-audit", "--no-fund"
    system "npm", "run", "build"

    # Vendor the compiled dist/ + runtime node_modules into libexec
    libexec.install "dist", "node_modules", "package.json"

    # Shim scripts so `coolify-11d` / `coolify-11d-mcp` are on PATH
    (bin / "coolify-11d").write <<~SH
      #!/usr/bin/env bash
      exec "#{Formula["node@22"].opt_bin}/node" "#{libexec}/dist/cli.js" "$@"
    SH
    (bin / "coolify-11d-mcp").write <<~SH
      #!/usr/bin/env bash
      exec "#{Formula["node@22"].opt_bin}/node" "#{libexec}/dist/mcp.js" "$@"
    SH
    chmod 0755, bin / "coolify-11d"
    chmod 0755, bin / "coolify-11d-mcp"
  end

  test do
    assert_match(/^\d+\.\d+\.\d+/, shell_output("#{bin}/coolify-11d --version"))
    assert_match "coolify-11d", shell_output("#{bin}/coolify-11d --help")
  end
end
