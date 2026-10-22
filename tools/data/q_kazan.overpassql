[out:json][timeout:180];
(
  way["highway"]["area"!="yes"](55.750,49.055,55.835,49.185);
  way["building"](55.750,49.055,55.835,49.185);
  relation["building"]["type"="multipolygon"](55.750,49.055,55.835,49.185);
  way["building:part"](55.750,49.055,55.835,49.185);
  relation["building:part"]["type"="multipolygon"](55.750,49.055,55.835,49.185);
  way["leisure"~"^(park|garden)$"](55.750,49.055,55.835,49.185);
  relation["leisure"~"^(park|garden)$"]["type"="multipolygon"](55.750,49.055,55.835,49.185);
  way["landuse"="grass"](55.750,49.055,55.835,49.185);
  way["natural"="water"](55.710,48.970,55.870,49.240);
  relation["natural"="water"](55.710,48.970,55.870,49.240);
  way["historic"="citywalls"](55.790,49.095,55.805,49.120);
);
out body geom;
