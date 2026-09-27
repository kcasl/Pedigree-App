$ErrorActionPreference = 'Stop'

$src = 'C:\Project\Pedigree_App\front\Assets\family_tree_app_icon-6.png'
$res = 'C:\Project\Pedigree_App\front\android\app\src\main\res'

$map = [ordered]@{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }

foreach ($d in $map.Keys) {
    $s = $map[$d]
    $dim = "${s}x${s}"
    $dir = Join-Path $res "mipmap-$d"
    $sq = Join-Path $dir 'ic_launcher.png'
    $rd = Join-Path $dir 'ic_launcher_round.png'

    # Square launcher icon
    & magick $src -resize $dim -strip $sq

    # Round launcher icon (circular mask)
    $r = ($s / 2.0)
    $edge = ($s - 0.5)
    $circle = "circle $r,$r $r,$edge"
    & magick $src -resize $dim -alpha set `
        '(' +clone -channel A -evaluate multiply 0 +channel -fill white -draw $circle ')' `
        -compose DstIn -composite -strip $rd

    Write-Output "$d -> $dim  (square + round) done"
}

Write-Output 'Android launcher icons generated.'
