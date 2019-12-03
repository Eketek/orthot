export { Ekvx2Interpreter }
import { trit, T, getAsset, storeAsset, releaseAsset, Material } from '../libek/libek.js'
import { property, properties_fromstring, mergeObjects, parseVec3, parseColor } from '../libek/util.js'

import { orthotCTL } from './orthot.js'
import { parseO2Orientation } from './util.js'
import { Wall, ScenePortal, InfoBlock, Stair, PushBlock, Crate, IceBlock, Key, Lock, Flag, Exit } from './simpleobjects.js'
import { Ladder, Portal, Button, Icefloor } from './attachments.js'
import { Gate, GateGroup } from './gate.js'
import { Mouse, Moose } from './creatures.js'
import { direction } from '../libek/direction.js'

let bxtbldr
let defineWallTerrain = function(id, color) {
  let sfc_v = bxtbldr.build_Sfcdef({
    color:color,
    tile:{
      rows:8,
      cols:8,
      x:Math.floor(Math.random()*4),
      y:4
    }
  })
  
  let sfc_h = bxtbldr.build_Sfcdef({
    color:color,
    tile:{
      rows:8,
      cols:8,
      x:Math.floor(Math.random()*5),
      y:0
    }
  })
  return bxtbldr.build_Terraindef( sfc_v,sfc_v,sfc_v,sfc_v, sfc_h,sfc_h )
}

var Ekvx2Interpreter = {
  configure:function(zone, ekvx) {
    bxtbldr = zone.bxtbldr
    zone.blackwall = defineWallTerrain( "blackwall", "rgba,0,0,0,1")
    zone.viewpoints = []
    // If the ekvx has not been prepared, expand, link, and process terrain data structures
    //  (for simplicity, this directly replaces objects on the ekvx data structure (which itself is a product of JSON parsing))
    if (!ekvx.expanded) {
      ekvx.expanded = true
      for (let sfcdefid in ekvx.Surfaces) {
        let sfcdef = ekvx.Surfaces[sfcdefid]
        
        // de-memoize the surface definition
        if (typeof(sfcdef.tile) == "number") {
          sfcdef.tile = ekvx.Memos[sfcdef.tile]
        }
        if (typeof(sfcdef.area8b) == "number") {
          sfcdef.area8b = ekvx.Memos[sfcdef.area8b]
        }
        
        // prepare BoxTerrain params / surface definition state data
        ekvx.Surfaces[sfcdefid] = bxtbldr.build_Sfcdef(sfcdef)
      }
      for (let terrainID in ekvx.Terrains) {
        let sfcdefids = ekvx.Terrains[terrainID]
        let sfcdefs = [
          ekvx.Surfaces[sfcdefids[0]],
          ekvx.Surfaces[sfcdefids[1]],
          ekvx.Surfaces[sfcdefids[2]],
          ekvx.Surfaces[sfcdefids[3]],
          ekvx.Surfaces[sfcdefids[4]],
          ekvx.Surfaces[sfcdefids[5]]
        ]
        ekvx.Terrains[terrainID] = bxtbldr.build_Terraindef.apply(bxtbldr, sfcdefs)
      }
    }
  },
  load:function(zone, ldstate, ekvx) {
    let vxc = zone.vxc
    let updBounds = function(x,y,z) {
      if (x<ldstate.min.x) ldstate.min.x=x
      if (y<ldstate.min.y) ldstate.min.y=y
      if (z<ldstate.min.z) ldstate.min.z=z

      if (x>ldstate.max.x) ldstate.max.x=x
      if (y>ldstate.max.y) ldstate.max.y=y
      if (z>ldstate.max.z) ldstate.max.z=z
    }
    // stage 1
    for (let obj of ekvx.Objects) {
      let [templateID, x,y,z] = obj.$
      let template = ekvx.Templates[templateID]
      updBounds(x,y,z)
      let loc = vxc.get(x,y,z)
      let gobj
      let align, color, mats
      let adjctn
      switch(template.type) {
        case "wall":
          vxc.loadTerrain(x,y,z, ekvx.Terrains[obj.$[4]])
          zone.putGameobject(loc, new Wall(zone))
          break
        case "view":
          zone.viewpoints.push(new THREE.Vector3(x,y,z))
          break
        case "start": {
          zone.playerMaterials = obj.materials
          let campos = new THREE.Vector3(x+5,y+3.5,z+1)
          zone.targets.__STARTLOC = {
            loc:loc,
            campos:new THREE.Vector3(campos.x, campos.y, campos.z)
          }
          // ekvx1 used Player/start as an easy place to put "zone" attributes 
          // ekvx2 might do the same thing, or it might get reconsidered.
          
          
          //let campos = property("camPos", datas, undefined, parseVec3)
          //ldstate.start_align = property("align", datas, undefined, parseO2Orientation)
          //ldstate.start_fpmode = property("camPos", datas) == "fp"
          /*
          let tipMSG = property("tip", datas)
          let defeatMSG
          if (zone.resetCause == "defeated") {
            defeatMSG = property("defeat", datas)
            if (!defeatMSG) {
              defeatMSG = property("death", datas)
            }
          }
          
          // If the startblock data has a message specified, set up am invisible InfoBlock for it
          if ( (tipMSG != undefined) | (defeatMSG != undefined) ) {
            let info_obj = new InfoBlock(zone, false, tipMSG, defeatMSG)
            ldstate.loaded_objects.push(info_obj)
            zone.putGameobject(x,y,z, info_obj)
          }
          */
        } break
      }
    }
    
    // stage 2
    for (let obj of ekvx.Objects) {
      let [templateID, x,y,z] = obj.$
      let template = ekvx.Templates[templateID]
      updBounds(x,y,z)
      let loc = vxc.get(x,y,z)
      let gobj
      let align, color, mats
      let adjctn
      
    }
  }
}