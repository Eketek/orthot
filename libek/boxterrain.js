export { BoxTerrain }
import { UV_ATTRIBUTE_PREFIX } from './shader.js'
import { getUID } from './libek.js'

/*
A voxel-terrain mesh generator.  This generates a blocky mesh chunks from volumetric data.

It produces a BufferGeometry Mesh with vertices, triangle-indices, normals, vertex colors, and two sets of texture coordinates
Each entry in the volumetric data results in a cube-shaped block in the mesh.

The vertices are the corners (extent) of each block.
All vertices are split (4 unique vertex/color/normal/texcoord sets per face, for a total of 24 for a lone 1x1x1 cube)
The normals are vectors which are perpendicular to each face/side (per-vertex).

Each face/side of each block is textured/colored independently by generating surface specifications for each side 
  (these are stored in the volmetric data at ContainerObject.terrain[side] ).

Color is written to vertex colors (same color for all 4 vertices)
Two sets of texture coordinates are produced.
  A "fixed-pattern" texture coordinate set is used for drawing a single tile from a texture atlas to every tile in the output mesh
  A "border" texture coordinate set is used for drawing a border around irregularly-shaped groups of coplanar adjacent surfaces (of the same mergeClass)
    (mergeClass is used to control which tiles are "merged" to form a group - if not specified, a unique ID will be generated and applied to surfaces defined
     by the same Object)
*/


//  Generate an arbitrarilly sized texture coordinate lookup table for an arbitrary rectangular section of a tilesheet.
var tcoordLUT_store = {}
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

// Preset values for vertices, normals, and triangle indices for block sides in all orthogonal directions.
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
      -0.5, 0,  0.5
    ]),
    normals: Float32Array.from([
      0,-1,0,
      0,-1,0,
      0,-1,0,
      0,-1,0
    ])
  },
  north:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([
       0.5, 0, -0.5,
      -0.5, 0, -0.5,
      -0.5, 1, -0.5,
       0.5, 1, -0.5
    ]),
    normals: Float32Array.from([
      0,0,-1,
      0,0,-1,
      0,0,-1,
      0,0,-1
    ])
  },
  south:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([
      -0.5, 0, 0.5,
       0.5, 0, 0.5,
       0.5, 1, 0.5,
      -0.5, 1, 0.5
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
      0.5, 1,  0.5
    ]),
    normals: Float32Array.from([
      1,0,0,
      1,0,0,
      1,0,0,
      1,0,0
    ])
  },
  west:{
    indices:[ 0,1,2, 0,2,3, ],
    vertices: Float32Array.from([
      -0.5, 0, -0.5,
      -0.5, 0,  0.5,
      -0.5, 1,  0.5,
      -0.5, 1, -0.5
    ]),
    normals: Float32Array.from([
      -1,0,0,
      -1,0,0,
      -1,0,0,
      -1,0,0
    ])
  }
}

// Generate an aribtrary length array filled with float32 color tuples (all the same specified value).
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


var TEXCOORDTYPE = {
  TILE:1,
  LUT8B:5
}

var BoxTerrain = function(material, uv2spec) {

  // This array is used to generate texture coordinatges
  // For each entry, a texture coordinate attribute is added to the output mesh.
  // Each entry defines what generator to use, the paramter name to read (from the surface specification), and the attribute name to write (to the mesh)
  // For the time being, this is only an internal simplification (was previously hard-coded logic), but will eventually be exposed to application logic
  // as part of a planned texturing system
  let texcoordInfos = [
  
    // fixed tile/pattern texture coordinate spec
    // Use the same texture coordinates for each tile
    { type:TEXCOORDTYPE.TILE,
      attrname:uv2spec.attrname,
      parname:"tile" },
    
    // "8 bit" border texture coordinate spec
    // produces texture coordinates per-tile (side) based on adjacent [coplanar] tiles
    // For each bit, a value of 0 indicates that the neighboring tile is of same or compatible type, and 1 indicates a border
    // Each bit represents a neighboring tile, in clockwise order, starting at upper-left.
    { type:TEXCOORDTYPE.LUT8B,
      parname:"area8b",
      attrname:"uv" }
  ]
  
  // define a surface class.
  //  id:           terrain class
  //  color:        face color or vertex colors to use with mesh output
  //  texcoords:    a map of texture coordinates
  //  mergeClass:
  this.build_Sfcdef = function(params) {
    
    // "surface" data structure.
    // These contain fixed properties, but are also used by BoxTerrain.build() to transfer local tile properties to MeshBuilder
    let sfc = {
      colors:buildColorArray(params.color),
      mergeClass:(params.mergeClass && (params.mergeClass != "auto")) ? params.mergeClass : getUID(),
      tci:[],  //texture coordinate information
      tcs:[]    //texture coordinates
    }
    
    // unpack texture coordinate properties
    for (let i = 0; i < texcoordInfos.length; i++) {
      let tci = texcoordInfos[i]
      switch(tci.type) {
        case TEXCOORDTYPE.TILE: {
          let tparams = params[tci.parname]
          let tw = 1/tparams.cols
          let th = 1/tparams.rows
          let x1 = tparams.x*tw
          let y1 = 1-tparams.y*th-th
          sfc.tci[i] = Float32Array.from([
            x1,    y1,
            x1+tw, y1,
            x1+tw, y1+th,
            x1,    y1+th
          ])
        } break
        case TEXCOORDTYPE.LUT8B: {
          let lutparams = params[tci.parname]
          if (lutparams) {
            if (Array.isArray(lutparams)) {
              sfc.tcis[i] = lutparams
              continue
            }
            if (lutparams.layout) {
              let rw = 1/lutparams.cols
              let rh = 1/lutparams.rows
              let x1 = lutparams.x*rw
              let y1 = 1-lutparams.y*rh-rh
              switch(lutparams.layout) {
                case "16x16":
                  sfc.tci[i] = build_texcoordLUT({x:x1, y:y1}, {x:x1+rw, y:y1+rh}, 16, 16)
                  break
              }
            }
            else {
              sfc.tci[i] = build_texcoordLUT(lutparams.ul, lutparams.br, lutparams.cols, lutparams.rows)
            }
          }
          else {
            sfc.tci[i] = build_texcoordLUT({x:0,y:0}, {x:1,y:1}, 16, 16)
          }
        } break
      }
    }
    return sfc
  }

  // define a volumetric terrain class.
  //  id:           terrain class
  //  <direction>:  surface class to use for each face
  this.build_Terraindef = function(north, east, south, west, up, down) {
    return {
      north:Object.assign( {}, north, _BoxTerrain_MeshData.north ),
      east:Object.assign( {}, east, _BoxTerrain_MeshData.east ),
      south:Object.assign( {}, south, _BoxTerrain_MeshData.south ),
      west:Object.assign( {}, west, _BoxTerrain_MeshData.west ),
      up:Object.assign( {}, up, _BoxTerrain_MeshData.up ),
      down:Object.assign( {}, down, _BoxTerrain_MeshData.down ),
    }
  }
  
  // Build a voxel mesh for a chunk
  // data: a scalar field representing the terrain to draw.  The value of each entry in the field is the object/surface class
  // area: THREE.Box defining the region to scan and generate a representative surface mesh for.  The scan will extend one unit outward from
  //        the spedified area (to properly generate edges)
  // offset:  If false, the generated Objects will be positioned at 0,0,0.  If true, they will be positioned at their own geometric center.
  this.build = function(data, area, offset=true) {
    let builder = new MeshBuilder()

    let x,y,z, terr, sfc, dir, pos, ofs, _8b, nbrs
    
    // sufrace comparison - compare a surface with an adjacent surface.
    // return values:
    //   0:  There is no adjacent surface
    //   1:  Adjacent surface has a different mergeClass as sfc (border should be drawn between them)
    //   2:  Adjacent surface has the same mergeClass as sfc (border should not be drawn between them)
    let query = function(ctn) {
      if (ctn && ctn.terrain) {
        let adjsfc = ctn.terrain[dir]
        if (sfc.mergeClass == adjsfc.mergeClass) {
          return 2
        }
        else {
          return 1
        }
      }
      return 0
    }
    
    let buildTile = function() {
      _8b = 255 - (
        (!nbrs[1]&&nbrs[0]==2)    |
        (!nbrs[3]&&nbrs[2]==2)<<1 |
        (!nbrs[5]&&nbrs[4]==2)<<2 |
        (!nbrs[7]&&nbrs[6]==2)<<3 |
        (!nbrs[9]&&nbrs[8]==2)<<4 |
        (!nbrs[11]&&nbrs[10]==2)<<5 |
        (!nbrs[13]&&nbrs[12]==2)<<6 |
        (!nbrs[15]&&nbrs[14]==2)<<7 )
      sfc.tcs = []
      for (let i = 0; i < texcoordInfos.length; i++) {
        switch(texcoordInfos[i].type) {
          case TEXCOORDTYPE.TILE:
            sfc.tcs[i] = sfc.tci[i]
          break
          case TEXCOORDTYPE.LUT8B:
            sfc.tcs[i] = sfc.tci[i][_8b]
          break
        }
      }
      builder.add(pos, sfc)
    }

    pos = new THREE.Vector3()
    ofs = new THREE.Vector3()

    if (offset) {
      ofs.set(-(area.min.x+area.max.x)/2, -(area.min.y+area.max.y)/2, -(area.min.z+area.max.z)/2)
    }
    
    //For each space in area containaining terrain:
    //  For each side with adjacent open space and no "knockout" flag:
    //    If border texture coordinates are requested:
    //      Query 8 coplanar neighboring spaces and 8 spaces next to those neighbors (in the direction of the normal vector) to generate a "neighbors" value
    //      If there is a visible neighboring tile and it shares the same mergeClass as the operand tile, add a no-border bit to the neighbors value
    //      Otherwise, add a border bit to the neighbors value
    //    Generate each requested texture coordinate (specific operation depends on texture coordinate type)
    //    Pass the [updated] data structure to the Mesh builder
    
    for (z = area.min.z; z <= area.max.z; z++) {
      for (y = area.min.y; y <= area.max.y; y++) {
        for (x = area.min.x; x <= area.max.x; x++) {
          let ctn = data.get(x,y,z)
          if (ctn && ctn.terrain) {
            let terr = ctn.terrain
            if (terr) {
              let adj = data.get(x,y+1,z)
              pos.set(x,y,z)
              pos.add(ofs)

              if ( (!ctn.terr_koU) && (!adj || !adj.terrain)) {
                dir = "up"
                sfc = terr.up
                nbrs = data.sample(x,y,z, query, -1,0,-1, -1,1,-1,  0,0,-1, 0,1,-1,  1,0,-1, 1,1,-1,  1,0,0, 1,1,0,  1,0,1, 1,1,1,  0,0,1, 0,1,1,  -1,0,1, -1,1,1,  -1,0,0, -1,1,0 )
                buildTile()
              }

              adj = data.get(x,y-1,z)
              if ( (!ctn.terr_koD) && (!adj || !adj.terrain)) {
                dir = "down"
                sfc = terr.down
                nbrs = data.sample(x,y,z, query, -1,0,1, -1,-1,1,  0,0,1, 0,-1,1,  1,0,1, 1,-1,1,  1,0,0, 1,-1,0,  1,0,-1, 1,-1,-1,  0,0,-1, 0,-1,-1,  -1,0,-1, -1,-1,-1,  -1,0,0, -1,-1,0 )
                buildTile()
              }

              adj = data.get(x+1,y,z)
              if ( (!ctn.terr_koW) && (!adj || !adj.terrain)) {
                dir = "east"
                sfc = terr.east
                nbrs = data.sample(x,y,z, query, 0,1,1,1,1,1,  0,1,0,1,1,0, 0,1,-1,1,1,-1, 0,0,-1,1,0,-1, 0,-1,-1,1,-1,-1, 0,-1,0,1,-1,0, 0,-1,1,1,-1,1, 0,0,1,1,0,1)
                buildTile()
              }
              
              adj = data.get(x-1,y,z)
              if ( (!ctn.terr_koE) && (!adj || !adj.terrain)) {
                dir = "west"
                sfc = terr.west
                nbrs = data.sample(x,y,z, query, 0,1,-1,-1,1,-1,  0,1,0,-1,1,0, 0,1,1,-1,1,1, 0,0,1,-1,0,1, 0,-1,1,-1,-1,1, 0,-1,0,-1,-1,0, 0,-1,-1,-1,-1,-1, 0,0,-1,-1,0,-1)
                buildTile()
              }
              
              adj = data.get(x,y,z-1)
              if ( (!ctn.terr_koS) && (!adj || !adj.terrain)) {
                dir = "north"
                sfc = terr.north
                nbrs = data.sample(x,y,z, query, 1,1,0,1,1,-1, 0,1,0,0,1,-1, -1,1,0,-1,1,-1, -1,0,0,-1,0,-1, -1,-1,0,-1,-1,-1, 0,-1,0,0,-1,-1, 1,-1,0,1,-1,-1, 1,0,0,1,0,-1)
                buildTile()
              }

              adj = data.get(x,y,z+1)
              if ( (!ctn.terr_koN) && (!adj || !adj.terrain)) {
                dir = "south"
                sfc = terr.south
                nbrs = data.sample(x,y,z, query, -1,1,0,-1,1,1, 0,1,0,0,1,1, 1,1,0,1,1,1, 1,0,0,1,0,1, 1,-1,0,1,-1,1, 0,-1,0,0,-1,1, -1,-1,0,-1,-1,1, -1,0,0,-1,0,1)
                buildTile()
              }
            }
          }
        }
      }
    }
    let obj = builder.build(material, false, true, true, texcoordInfos)
    ofs.multiplyScalar(-1)
    obj.position.copy(ofs)
    return obj
  }
}

// Combines many buffers [representing small parts of a mesh] into a single renderable mesh.
var MeshBuilder = function() {

  let submeshes = []

  //  Add an object to a given location
  //  loc:  position to place the object
  //  template:  mesh data generator
  this.add = function(loc, template) {
    let vertices = Float32Array.from(template.vertices)
    for (let i = 0; i < vertices.length;) {
      vertices[i++] += loc.x
      vertices[i++] += loc.y
      vertices[i++] += loc.z
    }
    let sm = {
      index:-1,
      indices:template.indices,
      vertices:vertices,
      normals:template.normals,
      uvs:template.tcs,
      colors:template.colors
    }

    submeshes.push(sm)
  }

  this.build = function(mat, offset, use_colors, use_uvs, texcoordInfos) {
  
    let num_indices = 0
    let num_verts = 0

    for (let sm of submeshes) {
      num_indices += sm.indices.length
      num_verts += sm.vertices.length
    }

    var geom = new THREE.BufferGeometry()

    // add vertices, triangle indices, and normals
    {
      let vertices = new Float32Array(num_verts)
      let indices = []
      let normals = new Float32Array(num_verts)
      
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
      
      geom.setIndex(indices)
      geom.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
      geom.addAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );
    }
    
    // add vertex colors
    if (use_colors) {
      let colors = new Float32Array(num_verts)
      let j = 0
      for (let sm of submeshes) {
        colors.set(sm.colors, j)
        j += sm.vertices.length
      }
      geom.addAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );
    }
    
    // add texture coordinates
    if (use_uvs) {
      for (let i = 0; i < texcoordInfos.length; i++) {
        let uvs = new Float32Array(num_verts)
        let j = 0
        for (let sm of submeshes) {
          uvs.set(sm.uvs[i], j)
          j += sm.uvs[i].length
        }
        geom.addAttribute( texcoordInfos[i].attrname, new THREE.BufferAttribute( uvs, 2 ) )
      }
    }
    return new THREE.Mesh(geom, mat)
  }
}










