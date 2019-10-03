export { BoxTerrain, DECAL_UVTYPE }
import { UV_ATTRIBUTE_PREFIX } from './shader.js'

/*
A voxel-terrain mesh generator.  As envisioned, it is intended to do many things, but that's a lot of work, so for now, it just generates box-terrain with 
rule-based auto-texturing.

The rest of this comment indicates what I was thinking before writing any code...

Broadly speaking, this should define the underlying functionality for generating surface meshes from volumetric data.  The idea is that it should accept 
mesh generation commands, generate small chunks of 3D data from templates, knit them together (or not depending if the rules forbid), and output mesh data.
Additionally, this should be able to alter a previously generated mesh, delete removed pieces, insert new pieces, and perform any re-arrangement or compaction
needed to to re-generate the Mesh (ideally, should just manipulate buffers and flag the mesh for an update).

Funtionality to consider:
3D Scalar field -> simple blocky terrain (textured cubes)
3D Scalar field -> blocky terrain (textured cubes) with offset geometry (vertices placed somewhere other than the 8 cube corners) and gadgets 
  (additional shapes inserted near the surface to represent detail)
3D scalar field -> detailed terrain (all details encoded as geometry, textures used strictly for texture)
3D scalar field -> isosurface (marching cubes/tetrahedrons)

heightmap -> 2D tesselated plane with vertically offset vertices
heightmap -> terraced terrain (terrain with flat levels at different heights)
Complex terraced terrain - Each terrace defined individually, with manipulations (slanted or curved areas, caves&bridges)

The various functionalities differ greatly enough and that they will probably implemented with separate coponents

hmmm.. back to honeycomb-based volume rendering!  (Actually, not really)

The plan at least for cube-type volumetric data is to split the cube into an "DOWN", "NORTH", and "EAST" regions 
(each dominating an octahedron-shaped region and corresponding to one of the cube's faces)
These spaces will have origins:  Down:(0,0,0) North:(0,0,0.5) East:(0.5,0,0) 

The following procedure is envisioned:
For each face of each volume:
  Sample  - grab information about main object adn surrounding objects
  Cull    - Check for obvious terminal cases and exit if found (generally, if the face either is between two volumetric objects or it is between two empty spaces
  Reduce  - convert alternative cases into the main case (remove excess bits of data non-destructively)
  Decimate  Further reduce combinatorial explosion by ignoring more bits of data.
  Lookup  - take the binary representation of what remains of the scalar data, and look up what to do/draw
  Output  - send commands to the generator to add/stich in the relevant mesh parts
  
Additionally, it should be possible simply to merge coplanar polygons and have it trianglulated)
*/


// texture coordinate lookup table generators.
var tcoordLUT_store = {}  
var FIXED_INDEX = -1
var LUT_8BIT = -2
var build_texcoordLUT = function(texcoord_ul, texcoord_br, num_cols, num_rows) {
  let x1, x2, y1, y2
  if (texcoord_ul == undefined) {
    x1 = 0
    y1 = 0
  }
  else if (Array.isArray(texcoord_ul)) {
    x1 = texcoord_ul[0]
    y1 = texcoord_ul[1]
  }
  else {
    x1 = texcoord_ul.x
    y1 = texcoord_ul.y
  }
  if (texcoord_br == undefined) {
    x2 = 1
    y2 = 1
  }
  else if (Array.isArray(texcoord_br)) {
    x2 = texcoord_br[0]
    y2 = texcoord_br[1]
  }
  else {
    x2 = texcoord_br.x
    y2 = texcoord_br.y
  }
  // Use parameters to memoize the LUT - easily many of the same table will be requested by an app.
  let k = `${num_cols}|${num_rows}|${x1}|${x2}|${y1}|${y2}`
  let texcoords = tcoordLUT_store[k]
  if (texcoords) {
    return texcoords
  }
  texcoords = []
  tcoordLUT_store[k] = texcoords
  
  let tw = (x2 - x1) / num_cols
  let th = (y2 - y1) / num_rows
  let num_entries = num_cols*num_rows
  for (let i = 0; i < num_entries; i++) {
    let x = num_cols - (i%num_cols) -1
    let y = Math.floor(i/num_cols)
    
    texcoords.push( Float32Array.from([ 
      x1+tw*x,    y1+th*y, 
      x1+tw*x+tw, y1+th*y, 
      x1+tw*x+tw, y1+th*y+th, 
      x1+tw*x,    y1+th*y+th
    ]))
  }
  texcoords.reverse()
  return texcoords
}

var _BoxTerrain_MeshData = {
  up:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([ 	  
      -0.5, 1,  0.5,
       0.5, 1,  0.5,
       0.5, 1, -0.5,
      -0.5, 1, -0.5
    ]),	  
    normals: Float32Array.from([ 	  
      0,1,0,
      0,1,0,
      0,1,0,
      0,1,0
    ]),
  },
  down:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([ 
    		      
      -0.5, 0, -0.5,
       0.5, 0, -0.5,
       0.5, 0,  0.5,
      -0.5, 0,  0.5,
    ]),	  
    normals: Float32Array.from([ 	  
      0,-1,0,
      0,-1,0,
      0,-1,0,
      0,-1,0
    ]),
  },
  
  north:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([ 
    	  
       0.5, 0, -0.5,
      -0.5, 0, -0.5,
      -0.5, 1, -0.5,
       0.5, 1, -0.5,
      
    ]),	  
    normals: Float32Array.from([ 	  
      0,0,-1,
      0,0,-1,
      0,0,-1,
      0,0,-1
    ]),
  },
  south:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([ 
    	  
      -0.5, 0, 0.5,
       0.5, 0, 0.5,
       0.5, 1, 0.5,
      -0.5, 1, 0.5,
       
      
    ]),	  
    normals: Float32Array.from([ 	  
      0,0,1,
      0,0,1,
      0,0,1,
      0,0,1
    ]),
  },
  
  
  east:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([ 	
      0.5, 0,  0.5,
      0.5, 0, -0.5,  
      0.5, 1, -0.5,
      0.5, 1,  0.5,
    ]),	  
    normals: Float32Array.from([ 	  
      1,0,0,
      1,0,0,
      1,0,0,
      1,0,0
    ]),
  },
  west:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([	    
      -0.5, 0, -0.5,  
      -0.5, 0,  0.5,
      -0.5, 1,  0.5,
      -0.5, 1, -0.5,
      
    ]),	  
    normals: Float32Array.from([ 	  
      -1,0,0,
      -1,0,0,
      -1,0,0,
      -1,0,0
    ]),
  },
}

var buildColorArray = function(arg, num_entries=4) {
  let r,g,b
  if (typeof(arg) == "string") {
    let fail = false
    let parts = arg.split(',')
    switch(parts[0]) {
      case "rgba":
        r = parts[1]
        g = parts[2]
        b = parts[3]
      break
      default:
        let c = new THREE.Color(arg)
        r = c.r
        g = c.g
        b = c.b
      break
    }
  }
  else if (Array.isArray(arg)) {
    r = color_arg[0]
    g = color_arg[1]
    b = color_arg[2]
  }
  else if (arg) {
    if (arg.isColor) {
      r = arg.r
      g = arg.g
      b = arg.b
    }
  }
  
  let rlen = num_entries *= 3
  let result = new Float32Array(rlen)
  let i = 0
  while (i < rlen) {
    result[i++] = r
    result[i++] = g
    result[i++] = b
  }
  return result
}

var DECAL_UVTYPE = {
  NONE:0,
  TILE:1,
  WORLD:2,    
  PROJECT:3,
}
var BoxTerrain = function(material, uv2spec) {    
  let surface = {}
  let terrain = {}
  
  // define a surface class. 
  //  id:           terrain class
  //  color:        face color or vertex colors to use with mesh output
  //  texcoords:    a map of texture coordinates
  //  mergeWith:  
  this.defineSurface = function(id, params) {
    
    let sfc = surface[id] = {
      id:id,
      colors:buildColorArray(params.color),
      mergeWith:params.mergewith ? params.mergewith : [id],
      indextype:params.index
    }
    if (params.index >= 0) {
      sfc.indextype = FIXED
      sfc.uvs = params.texcoords[params.index]
    }
    else {
      sfc.texcoords = params.texcoords
    }
     
    if (params.uv2info) {  
      let uv2info = params.uv2info    
      let utype
      utype = uv2info.type
      
      switch(utype) {
        case DECAL_UVTYPE.TILE:
          let tile
          if (uv2info.literal) {
            tile = uv2info.literal
          }
          else if (uv2info.lut) {
            let ncols = uv2info.lut.num_cols ? uv2info.lut.num_cols : 16
            let nrows = uv2info.lut.num_rows ? uv2info.lut.num_rows : 16
            let tctbl = build_texcoordLUT(uv2info.lut.texcoord_ul, uv2info.lut.texcoord_br, ncols, nrows)
            tile = tctbl[uv2info.lut.entry]
          }
          else {
            tile = Float32Array.from([ 0,0, 1,0, 1,1, 0,1 ])
          }
          sfc.gen_uv2 = function() { return tile }            
        break
        case DECAL_UVTYPE.WORLD:
          let scale = uv2info.scale ? uv2info.scale : 1
          let f = 1.0 / scale
          let h = 0.5 / scale
          sfc.gen_uv2 = function(x,y,z) {
            let _x = x*f
            let _y = y*f
            let _z = z*f
            
            switch(dir) {
              case "up":
              case "down":
                return Float32Array.from([ _x-h,_z-h, _x+h,_z-h, _x+h,_z+h, _x-h,_z+h ])
              break
              case "east":
              case "west":
                return Float32Array.from([ _z-h,_y+f, _z+h,_y+f, _z+h,_y, _z-h,_y ])
              break
              case "north":
              case "south":
                return Float32Array.from([ _x-h,_y+f, _x+h,_y+f, _x+h,_y, _x-h,_y ])
              break
              default:
                return Float32Array.from([ 0,0, 1,0, 1,1, 0,1 ])
              break
            }
          }
        break
        case DECAL_UVTYPE.PROJECT:    
          let vpos = new THREE.Vector3()  
          let um, dm, nm, em, sm, wm
          if (uv2info.matrix) {
            um = dm = nm = sm = em = wm = uv2info.matrix
          }
          um = uv2info.up ? uv2info.up : um
          dm = uv2info.down ? uv2info.down : dm
          nm = uv2info.north ? uv2info.north : nm
          em = uv2info.east ? uv2info.east : em
          sm = uv2info.south ? uv2info.south : sm
          wm = uv2info.west ? uv2info.west : wm
              
          sfc.gen_uv2 = function(x,y,z) {
            let mat
            let r = new Float32Array(8)
            switch(dir) {
              case "up": 
                vpos.set(x-0.5,y+1,z+0.5)
                vpos.applyMatrix4(um)
                r[0] = vpos.x
                r[1] = vpos.y
                vpos.set(x+0.5,y+1,z+0.5)
                vpos.applyMatrix4(um)
                r[2] = vpos.x
                r[3] = vpos.y
                vpos.set(x+0.5,y+1,z-0.5)
                vpos.applyMatrix4(um)
                r[4] = vpos.x
                r[5] = vpos.y
                vpos.set(x-0.5,y+1,z-0.5)
                vpos.applyMatrix4(um)
                r[6] = vpos.x
                r[7] = vpos.y
              break;
              case "down":  
                vpos.set(x-0.5,y,z-0.5)
                vpos.applyMatrix4(dm)
                r[0] = vpos.x
                r[1] = vpos.y
                vpos.set(x+0.5,y,z-0.5)
                vpos.applyMatrix4(dm)
                r[2] = vpos.x
                r[3] = vpos.y
                vpos.set(x+0.5,y,z+0.5)
                vpos.applyMatrix4(dm)
                r[4] = vpos.x
                r[5] = vpos.y
                vpos.set(x-0.5,y,z+0.5)
                vpos.applyMatrix4(dm)
                r[6] = vpos.x
                r[7] = vpos.y
              break;
              
              case "north": 
                vpos.set(x+0.5,y,z-0.5)
                vpos.applyMatrix4(nm)
                r[0] = vpos.x
                r[1] = vpos.y
                vpos.set(x-0.5,y,z-0.5)
                vpos.applyMatrix4(nm)
                r[2] = vpos.x
                r[3] = vpos.y
                vpos.set(x-0.5,y+1,z-0.5)
                vpos.applyMatrix4(nm)
                r[4] = vpos.x
                r[5] = vpos.y
                vpos.set(x+0.5,y+1,z-0.5)
                vpos.applyMatrix4(nm)
                r[6] = vpos.x
                r[7] = vpos.y
              break;                
              case "south": 
                vpos.set(x-0.5,y,z+0.5)
                vpos.applyMatrix4(sm)
                r[0] = vpos.x
                r[1] = vpos.y
                vpos.set(x+0.5,y,z+0.5)
                vpos.applyMatrix4(sm)
                r[2] = vpos.x
                r[3] = vpos.y
                vpos.set(x+0.5,y+1,z+0.5)
                vpos.applyMatrix4(sm)
                r[4] = vpos.x
                r[5] = vpos.y
                vpos.set(x-0.5,y+1,z+0.5)
                vpos.applyMatrix4(sm)
                r[6] = vpos.x
                r[7] = vpos.y
              break;
              
              case "east": 
                vpos.set(x+0.5,y,z+0.5)
                vpos.applyMatrix4(em)
                r[0] = vpos.x
                r[1] = vpos.y
                vpos.set(x+0.5,y,z-0.5)
                vpos.applyMatrix4(em)
                r[2] = vpos.x
                r[3] = vpos.y
                vpos.set(x+0.5,y+1,z-0.5)
                vpos.applyMatrix4(em)
                r[4] = vpos.x
                r[5] = vpos.y
                vpos.set(x+0.5,y+1,z+0.5)
                vpos.applyMatrix4(em)
                r[6] = vpos.x
                r[7] = vpos.y
              break; 
              case "west": 
                vpos.set(x-0.5,y,z-0.5)
                vpos.applyMatrix4(wm)
                r[0] = vpos.x
                r[1] = vpos.y
                vpos.set(x-0.5,y,z+0.5)
                vpos.applyMatrix4(wm)
                r[2] = vpos.x
                r[3] = vpos.y
                vpos.set(x-0.5,y+1,z+0.5)
                vpos.applyMatrix4(wm)
                r[4] = vpos.x
                r[5] = vpos.y
                vpos.set(x-0.5,y+1,z-0.5)
                vpos.applyMatrix4(wm)
                r[6] = vpos.x
                r[7] = vpos.y
              break;
              default:
                return Float32Array.from([ 0,0, 1,0, 1,1, 0,1 ])
              break
              /*
              case "down":  mat = dm; break;
              case "north": mat = nm; break;
              case "east":  mat = em; break;
              case "south": mat = sm; break;
              case "west":  mat = wm; break;
              */
            }
            return r
          }
        break
      }
    }
    else {
      sfc.gen_uv2 = function() {}
    }
    return sfc
  }
  
  // define a volumetric terrain class. 
  //  id:           terrain class
  //  <direction>:  surface class to use for each face
  this.defineTerrain = function(id, north, east, south, west, up, down) {
    // bam.  Data structure.  
    terrain[id] = {
      id:id,
      north:Object.assign( {}, surface[north], _BoxTerrain_MeshData.north ),
      east:Object.assign( {}, surface[east], _BoxTerrain_MeshData.east ),
      south:Object.assign( {}, surface[south], _BoxTerrain_MeshData.south ),
      west:Object.assign( {}, surface[west], _BoxTerrain_MeshData.west ),
      up:Object.assign( {}, surface[up], _BoxTerrain_MeshData.up ),
      down:Object.assign( {}, surface[down], _BoxTerrain_MeshData.down ),
    }
    return terrain[id]
  }
  
  // "8 bit" wall is a virtual texture used in conjunction with a discriminator function to texture a visually distinct & coherent square 
  //    tiles on a plane.  
  //  8 surrounding tiles are used to generate an 8-bit number representing the border of the tile
  //  For each bit, a value of 0 indicates that the neighboring tile is of same or compatible type, and 1 indicates a border
  //  Each bit represents a neighboring tile, in clockwise order, starting at upper-left.
  //this.defineSurface_8bit = function(id, color, mergeWith = undefined, texcoord_ul=undefined, texcoord_br=undefined, num_cols = 16) {
  //  let texcoords = libek.gen.build_texcoordLUT(texcoord_ul, texcoord_br, num_cols, 256/num_cols)
  //  return this.defineSurface(id, color, texcoords, libek.gen.LUT_8BIT, mergeWith) 
  // }
  
  this.defineSurface_8bit = function(id, params) {
    let num_cols = params.num_cols ? params.num_cols : 16
    params.index = LUT_8BIT
    params.texcoords = build_texcoordLUT(params.texcoord_ul, params.texcoord_br, num_cols, 256/num_cols)
    return this.defineSurface(id, params)// params.color, texcoords, params.index) 
  }
  
  // data: a scalar field representing the terrain to draw.  The value of each entry in the field is the object/surface class
  // area: THREE.Box defining the region to scan and generate a representative surface mesh for.  The scan will extend one unit outward from    
  //        the spedified area (to properly generate edges)    
  // offset:  If false, the generated Objects will be positioned at 0,0,0.  If true, they will be positioned at their own geometric center.
  this.build = function(data, area, offset=true) {
    let builder = new MeshBuilder()
    
    let x,y,z, terr, sfc, dir, pos, ofs
    let query = function(ctn) {
      if (ctn && ctn.terrain && ctn.terrain.id) {
        let adjsfc = terrain[ctn.terrain.id][dir]
        if (sfc.mergeWith.indexOf(adjsfc.id) != -1) {
          return 2
        }
        else {
          return 1
        }
      }
      return 0
    }
    let gen_uv2 = function() {}
    
    pos = new THREE.Vector3()
    ofs = new THREE.Vector3()
    
    if (offset) {
      ofs.set(-(area.min.x+area.max.x)/2, -(area.min.y+area.max.y)/2, -(area.min.z+area.max.z)/2)
    }
    
    for (z = area.min.z; z <= area.max.z; z++) {
      for (y = area.min.y; y <= area.max.y; y++) {        
        for (x = area.min.x; x <= area.max.x; x++) {
          let ctn = data.get(x,y,z)
          if (ctn && ctn.terrain && ctn.terrain.id) {
            let tdat = ctn.terrain
            let terr = terrain[tdat.id]
            if (terr) {
              let adj = data.get(x,y+1,z)
              pos.set(x,y,z)
              pos.add(ofs)
              
              if ( (!tdat.koU) && (!adj || !adj.terrain || !adj.terrain.id)) {
                dir = "up"
                sfc = terr.up
                switch (sfc.indextype) {
                  case LUT_8BIT: {
                    let nbrs = data.sample(x,y,z, query, -1,0,-1, -1,1,-1,  0,0,-1, 0,1,-1,  1,0,-1, 1,1,-1,  1,0,0, 1,1,0,  1,0,1, 1,1,1,  0,0,1, 0,1,1,  -1,0,1, -1,1,1,  -1,0,0, -1,1,0 )
                    let tc_idx = 255 - (
                      (!nbrs[1]&&nbrs[0]==2)    | 
                      (!nbrs[3]&&nbrs[2]==2)<<1 |
                      (!nbrs[5]&&nbrs[4]==2)<<2 |
                      (!nbrs[7]&&nbrs[6]==2)<<3 |
                      (!nbrs[9]&&nbrs[8]==2)<<4 |
                      (!nbrs[11]&&nbrs[10]==2)<<5 |
                      (!nbrs[13]&&nbrs[12]==2)<<6 |
                      (!nbrs[15]&&nbrs[14]==2)<<7 )
                    sfc.uvs = sfc.texcoords[tc_idx]
                    sfc.uv2s = sfc.gen_uv2()
                    builder.add(pos, sfc)
                  }
                  break
                  case FIXED:
                    builder.add(pos, sfc)
                  break
                }
              }
              
              adj = data.get(x,y-1,z)
              if ( (!tdat.koD) && (!adj || !adj.terrain || !adj.terrain.id)) {
                dir = "down"
                sfc = terr.down
                switch (sfc.indextype) {
                  case LUT_8BIT: {
                    let nbrs = data.sample(x,y,z, query, -1,0,1, -1,-1,1,  0,0,1, 0,-1,1,  1,0,1, 1,-1,1,  1,0,0, 1,-1,0,  1,0,-1, 1,-1,-1,  0,0,-1, 0,-1,-1,  -1,0,-1, -1,-1,-1,  -1,0,0, -1,-1,0 )
                    let tc_idx = 255 - (
                      (!nbrs[1]&&nbrs[0]==2)    | 
                      (!nbrs[3]&&nbrs[2]==2)<<1 |
                      (!nbrs[5]&&nbrs[4]==2)<<2 |
                      (!nbrs[7]&&nbrs[6]==2)<<3 |
                      (!nbrs[9]&&nbrs[8]==2)<<4 |
                      (!nbrs[11]&&nbrs[10]==2)<<5 |
                      (!nbrs[13]&&nbrs[12]==2)<<6 |
                      (!nbrs[15]&&nbrs[14]==2)<<7 )
                    sfc.uvs = sfc.texcoords[tc_idx]
                    sfc.uv2s = sfc.gen_uv2()
                    builder.add(pos, sfc)
                  }
                  break
                  case FIXED:
                    builder.add(pos, sfc)
                  break
                }
              }
              
              adj = data.get(x+1,y,z)
              if ( (!tdat.koW) && (!adj || !adj.terrain || !adj.terrain.id)) {
                dir = "east"
                sfc = terr.east
                switch (sfc.indextype) {
                  case LUT_8BIT: {
                    let nbrs = data.sample(x,y,z, query, 0,1,1,1,1,1,  0,1,0,1,1,0, 0,1,-1,1,1,-1, 0,0,-1,1,0,-1, 0,-1,-1,1,-1,-1, 0,-1,0,1,-1,0, 0,-1,1,1,-1,1, 0,0,1,1,0,1)
                    let tc_idx = 255 - (
                      (!nbrs[1]&&nbrs[0]==2)    | 
                      (!nbrs[3]&&nbrs[2]==2)<<1 |
                      (!nbrs[5]&&nbrs[4]==2)<<2 |
                      (!nbrs[7]&&nbrs[6]==2)<<3 |
                      (!nbrs[9]&&nbrs[8]==2)<<4 |
                      (!nbrs[11]&&nbrs[10]==2)<<5 |
                      (!nbrs[13]&&nbrs[12]==2)<<6 |
                      (!nbrs[15]&&nbrs[14]==2)<<7 )
                    sfc.uvs = sfc.texcoords[tc_idx]
                    sfc.uv2s = sfc.gen_uv2()
                    builder.add(pos, sfc)
                  }
                  break
                  case FIXED:
                    builder.add(pos, sfc)
                  break
                }
              }                
              adj = data.get(x-1,y,z)
              if ( (!tdat.koE) && (!adj || !adj.terrain || !adj.terrain.id)) {
                dir = "west"
                sfc = terr.west
                switch (sfc.indextype) {
                  case LUT_8BIT: {
                    let nbrs = data.sample(x,y,z, query, 0,1,-1,-1,1,-1,  0,1,0,-1,1,0, 0,1,1,-1,1,1, 0,0,1,-1,0,1, 0,-1,1,-1,-1,1, 0,-1,0,-1,-1,0, 0,-1,-1,-1,-1,-1, 0,0,-1,-1,0,-1)
                    let tc_idx = 255 - (
                      (!nbrs[1]&&nbrs[0]==2)    | 
                      (!nbrs[3]&&nbrs[2]==2)<<1 |
                      (!nbrs[5]&&nbrs[4]==2)<<2 |
                      (!nbrs[7]&&nbrs[6]==2)<<3 |
                      (!nbrs[9]&&nbrs[8]==2)<<4 |
                      (!nbrs[11]&&nbrs[10]==2)<<5 |
                      (!nbrs[13]&&nbrs[12]==2)<<6 |
                      (!nbrs[15]&&nbrs[14]==2)<<7 )
                    sfc.uvs = sfc.texcoords[tc_idx]
                    sfc.uv2s = sfc.gen_uv2()
                    builder.add(pos, sfc)
                  }
                  break
                  case FIXED:
                    builder.add(pos, sfc)
                  break
                }
              }
              
              
              
              adj = data.get(x,y,z-1)
              if ( (!tdat.koS) && (!adj || !adj.terrain || !adj.terrain.id)) {
                dir = "north"
                sfc = terr.north
                switch (sfc.indextype) {
                  case LUT_8BIT: {
                    let nbrs = data.sample(x,y,z, query, 1,1,0,1,1,-1, 0,1,0,0,1,-1, -1,1,0,-1,1,-1, -1,0,0,-1,0,-1, -1,-1,0,-1,-1,-1, 0,-1,0,0,-1,-1, 1,-1,0,1,-1,-1, 1,0,0,1,0,-1)
                    let tc_idx = 255 - (
                      (!nbrs[1]&&nbrs[0]==2)    | 
                      (!nbrs[3]&&nbrs[2]==2)<<1 |
                      (!nbrs[5]&&nbrs[4]==2)<<2 |
                      (!nbrs[7]&&nbrs[6]==2)<<3 |
                      (!nbrs[9]&&nbrs[8]==2)<<4 |
                      (!nbrs[11]&&nbrs[10]==2)<<5 |
                      (!nbrs[13]&&nbrs[12]==2)<<6 |
                      (!nbrs[15]&&nbrs[14]==2)<<7 )
                    sfc.uvs = sfc.texcoords[tc_idx]
                    sfc.uv2s = sfc.gen_uv2()
                    builder.add(pos, sfc)
                  }
                  break
                  case FIXED:
                    builder.add(pos, sfc)
                  break
                }
              }
              
              adj = data.get(x,y,z+1)
              if ( (!tdat.koN) && (!adj || !adj.terrain || !adj.terrain.id)) {
                dir = "south"
                sfc = terr.south
                switch (sfc.indextype) {
                  case LUT_8BIT: {
                    let nbrs = data.sample(x,y,z, query, -1,1,0,-1,1,1, 0,1,0,0,1,1, 1,1,0,1,1,1, 1,0,0,1,0,1, 1,-1,0,1,-1,1, 0,-1,0,0,-1,1, -1,-1,0,-1,-1,1, -1,0,0,-1,0,1)
                    let tc_idx = 255 - (
                      (!nbrs[1]&&nbrs[0]==2)    | 
                      (!nbrs[3]&&nbrs[2]==2)<<1 |
                      (!nbrs[5]&&nbrs[4]==2)<<2 |
                      (!nbrs[7]&&nbrs[6]==2)<<3 |
                      (!nbrs[9]&&nbrs[8]==2)<<4 |
                      (!nbrs[11]&&nbrs[10]==2)<<5 |
                      (!nbrs[13]&&nbrs[12]==2)<<6 |
                      (!nbrs[15]&&nbrs[14]==2)<<7 )
                    sfc.uvs = sfc.texcoords[tc_idx]
                    sfc.uv2s = sfc.gen_uv2()
                    builder.add(pos, sfc)
                  }
                  break
                  case FIXED:
                    builder.add(pos, sfc)
                  break
                }
              }
            }
          }
        }
      }
    }
    let obj = builder.build(material, false, true, true, uv2spec)
    ofs.multiplyScalar(-1)
    obj.position.copy(ofs)
    return obj
  }
}

var MeshBuilder = function() {

  let submeshes = []
  
  let indices, vertices, normals, uvs, colors
  
  let num_indices, num_verts

  //  Add an object to a given location
  //  loc:  position to place the object
  //  template:  mesh data generator
  this.add = function(loc, template) {
    let p = loc
    
    let _tmpl = template
    
    let _vertices = Float32Array.from(template.vertices)
    for (let i = 0; i < _vertices.length;) {
      _vertices[i++] += p.x
      _vertices[i++] += p.y
      _vertices[i++] += p.z
    }
    let sm = {
      index:-1,
      
      //slack_indices:0,      //space allocated for extra triangles
      //slack_vertices:0,     //space allocated for extra vertices
      
      indices:template.indices,
      vertices:_vertices,
      normals:template.normals,
      uvs:template.uvs,
      uv2s:template.uv2s,
      colors:template.colors
    }
    
    submeshes.push(sm)
  }
  
  // Merge the object at locA with the object at locB
  //    (This is used for objects which, if positioned adjacent to each other, should add, remove, or merge vertices to build a composite object.
  //this.merge = function(locA, locB) {}
  
  //Delete an object at a given location
  this.remove = function(sm) {
    submeshes.splice(submeshes.indexOf(sm),1)
  }
  
  //perform post-processing (if applicable), flag any dynamic THREE.Mesh object(s) for updates
  this.update = function() {}    
       
  this.build = function(mat, offset, use_colors, use_uvs, uv2spec) {
    
    num_indices = 0
    num_verts = 0
    
    for (let sm of submeshes) {
      num_indices += sm.indices.length
      num_verts += sm.vertices.length
    }
    
    //indices = new Array(num_indices)
    indices = []
    vertices = new Float32Array(num_verts)
    normals = new Float32Array(num_verts)      
    
    //uvs = new Float32Array(num_verts)
    //colors = new Float32Array(num_verts)
    
    {
      let i = 0
      let j = 0
      for (let sm of submeshes) {
        sm.index = i
        let k = j/3
        for (let ii = 0; ii < sm.indices.length; ii++) {
          indices[i+ii] = sm.indices[ii]+k
        }
        vertices.set(sm.vertices, j)
        normals.set(sm.normals, j)
        i += sm.indices.length
        j += sm.vertices.length
      }
    }
    
    var geom = new THREE.BufferGeometry()
    geom.setIndex(indices)
    geom.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
    geom.addAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );
    
    if (use_colors) {
      colors = new Float32Array(num_verts)
      let j = 0
      for (let sm of submeshes) {        
        colors.set(sm.colors, j)
        j += sm.vertices.length
      }
      geom.addAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );
    }
    if (use_uvs) {
      uvs = new Float32Array(num_verts)
      let j = 0
      for (let sm of submeshes) {    
        uvs.set(sm.uvs, j)
        j += sm.uvs.length
      }
      geom.addAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
    }
    
    if (uv2spec) {
    
      let attrname
      if (uv2spec.isUVspec) {
        attrname = uv2spec.attrname
      }
      else {
        attrname = UV_ATTRIBUTE_PREFIX + uv2spec
      }
      
      uvs = new Float32Array(num_verts)
      let j = 0
      for (let sm of submeshes) {   
        uvs.set(sm.uv2s, j)
        j += sm.uv2s.length
      }
      geom.addAttribute( attrname, new THREE.BufferAttribute( uvs, 2 ) );
    }
    
    return new THREE.Mesh(geom, mat)
  }
}










