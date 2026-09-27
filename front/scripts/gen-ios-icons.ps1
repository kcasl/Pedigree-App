$ErrorActionPreference = 'Stop'

$src = 'C:\Project\Pedigree_App\front\Assets\family_tree_app_icon-6.png'
$out = 'C:\Project\Pedigree_App\front\ios\pedigree_app\Images.xcassets\AppIcon.appiconset'

# filename -> pixel size
$icons = [ordered]@{
    'icon-20@2x.png'  = 40
    'icon-20@3x.png'  = 60
    'icon-29@2x.png'  = 58
    'icon-29@3x.png'  = 87
    'icon-40@2x.png'  = 80
    'icon-40@3x.png'  = 120
    'icon-60@2x.png'  = 120
    'icon-60@3x.png'  = 180
    'icon-1024.png'   = 1024
}

foreach ($name in $icons.Keys) {
    $s = $icons[$name]
    $dim = "${s}x${s}"
    $path = Join-Path $out $name
    # iOS icons must be opaque (no alpha) and exactly square
    & magick $src -resize $dim -background white -alpha remove -alpha off -strip $path
    Write-Output "$name -> $dim done"
}

Write-Output 'iOS AppIcon images generated.'
