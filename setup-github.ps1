# GitHub Setup Script for Sentinel AI Project
# Run this script AFTER installing Git

Write-Host "🚀 Sentinel AI - GitHub Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if git is installed
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Git is not installed!" -ForegroundColor Red
    Write-Host "Please install Git from: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "Then restart VS Code and run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Git is installed" -ForegroundColor Green
Write-Host ""

# Initialize Git repository
Write-Host "📦 Initializing Git repository..." -ForegroundColor Yellow
git init

# Add all files
Write-Host "📝 Adding all files to Git..." -ForegroundColor Yellow
git add .

# Create initial commit
Write-Host "💾 Creating initial commit..." -ForegroundColor Yellow
git commit -m "Initial commit: Sentinel AI - Public Safety Dashboard"

# Get GitHub username
Write-Host ""
Write-Host "Please enter your GitHub username:" -ForegroundColor Cyan
$username = Read-Host

# Get repository name
Write-Host ""
Write-Host "Please enter the repository name (e.g., sentinel-ai-dashboard):" -ForegroundColor Cyan
$repoName = Read-Host

# Set branch to main
Write-Host ""
Write-Host "🔀 Setting default branch to 'main'..." -ForegroundColor Yellow
git branch -M main

# Add remote origin
Write-Host "🌐 Adding GitHub remote..." -ForegroundColor Yellow
git remote add origin "https://github.com/$username/$repoName.git"

# Show next steps
Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "✅ Local Git setup complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Create a new repository on GitHub: https://github.com/new" -ForegroundColor White
Write-Host "   - Repository name: $repoName" -ForegroundColor White
Write-Host "   - Make it Public or Private" -ForegroundColor White
Write-Host "   - DON'T initialize with README, .gitignore, or license" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. After creating the repo on GitHub, run:" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor Green
Write-Host ""
Write-Host "If this is your first time, Git will ask for authentication." -ForegroundColor Yellow
Write-Host "Use your GitHub username and a Personal Access Token as password." -ForegroundColor Yellow
Write-Host ""
