export { renderCTL, inputCTL, sviewCTL, edCTL }

import { 
  tt, initLIBEK, 
  Display, 
  load, loadMuch, loadZIP, fetchText,
  assignMaterials, getAsset, storeAsset, 
  pickPlanepos, debug_tip 
} from '../libek/libek.js'
import { UVspec, buildVariantMaterial, ManagedColor } from '../libek/shader.js'
import { QueryTriggeredButtonControl, SceneviewController } from '../libek/control.js'
import { clamp, putFloatingElement, centerElementOverElement } from '../libek/util.js'
import { NextEventManager, next, on } from '../libek/nextevent.js'
import { direction } from '../libek/direction.js'
import { BoxTerrain } from '../libek/gen.js'
import { VxScene } from '../libek/scene.js'
// Global rendering properties & controls (Mainly, materials and managed shader properties)
var renderCTL = window.rctl = {
  uv2:new UVspec()
}

//Input controller.  Mouse & keyboard
var inputCTL = window.ictl = {}

// Screen-view controller:  Camera controller which performs orbitting, following, and a bit of flying.
var sviewCTL

var edCTL = window.ectl = {
  tiles:{},
  version:"0.1.0",
  event:new EventTarget(),
  assets:{}
}

$(async function MAIN() {

  initLIBEK()

  let disp_elem = $("#editor").attr("tabindex", "0").get(0)
  disp_elem.addEventListener( 'contextmenu', function(evt) {evt.preventDefault()} )
  disp_elem.focus()
  renderCTL.display = Display(disp_elem, true)
  renderCTL.display.renderer.setClearAlpha(1)
  renderCTL.display.renderer.setClearColor("black")
  

  let TextureProps = {
    magFilter:THREE.NearestFilter,
    anisotropy:4,
  }
  try {
    // Asset management - check assets/verison.txt, compare everything with stored version numbers
    //  If the version is old, use fetch option {cache:"reload"} to force a reload of any old data
    //  Otherwise, use default fetch options
    // While so doing, setup an asynchronous download of everything (and wait for everything to be completed)
    //  Should probably run some sort of display hack and show a progress bar while waiting.
    let dver_file = await fetchText("assets/edversion.txt", {cache:"no-store"})
    let lines = dver_file.split('\n')
    let current_versions = {}
    let prev_versions = {}
    for (let line of lines) {
      line = line.trim()
      if (line != '') {
        let parts = line.split(' ')
        current_versions[parts[0]] = 0|parseInt(parts[1])
      }
    }  
    let reloadOPT = { cache:"reload" }
    
    // accepts a property name and loader function, checks the previous known version against the reported current version,
    //  and if the file is indicated to be old, calls the loader function with a forced reload fetch option
    //  (if not old, the call is made with fetch defaults, so as to accept whatever is cached)
    let update = async function(propname, loadit) {
      let curr_ver = current_versions[propname]
      let prev_ver = 0|parseInt(window.localStorage[propname+"EDVER"])
      let result = await loadit((curr_ver > prev_ver) ? reloadOPT : undefined)
      return result
    }
    
    // call each update, but aggregate all the promises
    let promises = [
      update("texture", (fetchOPTS)=>{
        return loadMuch(
          edCTL.assets,
          fetchOPTS,
          {url:"assets/textures/patterns.png", properties:TextureProps},
          {url:"assets/textures/wall_8bit_fg.png", properties:TextureProps},
        )
      }),
      update("model", (fetchOPTS)=>{
        return loadZIP(edCTL.assets, 'assets/ekvxed2models.zip', fetchOPTS)
      })
    ]
    
    // Whene everything is loaded, update local storage with the versions of the cached files
    await Promise.all(promises)
    console.log("Loaded Ekvxed2 data")
    for (let name in current_versions) {
      window.localStorage[name+"EDVER"] = current_versions[name]
    }
  }
  catch(err) {
    console.log("FAILED to load Ekvxed2 data because:", err)
    return
  }
  /*
  edCTL.tiles.key = {
    source:edCTL.assets.symbols.image,
    x:0, y:0, w:64, h:64
  }
  */
  
  let UI_TILEGRAPHIC_SIZE = [32,32]
  let UI_TILEGRAPHIC_OFFSET = [0, 0]
  let UI_TILESHADOW_SIZE = 8
  let UI_TILESHADOW_OFFSET = [5,3]
  let UI_TILE_SIZE = [37,35]
  
  renderCTL.fg = new ManagedColor("yellow")
  renderCTL.bg1 = new ManagedColor("orange")
  renderCTL.bg2 = new ManagedColor("green")

  renderCTL.vxlMAT = buildVariantMaterial("standard", {
    map:edCTL.assets.wall_8bit_fg,
    bkgtex:edCTL.assets.patterns,
    uv2:renderCTL.uv2,
    roughness:0.76,
    metalness:0.05,
    sample:tt`
      vec4 mc = texture2D( map, vUv );
      vec4 bc = texture2D( bkgtex, uv2 );
      vec3 fgColor = vColor*mc.r + ${renderCTL.fg}*mc.g;
      vec3 bgColor = vColor*bc.r + ${renderCTL.bg1}*bc.g + ${renderCTL.bg2}*bc.b;
      sample = vec4(fgColor * mc.a + bgColor*(1.0-mc.a), 1.0);
    `
  })

  let markmats = [{color:"green", emissive:"green", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]
  let cursormats = [{color:"white", emissive:"white", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]

  assignMaterials(edCTL.assets.CubeMark, markmats)
  assignMaterials(edCTL.assets.FaceMark, markmats)
  assignMaterials(edCTL.assets.CubeCursor, cursormats)
  assignMaterials(edCTL.assets.FaceCursor, cursormats)
  

  let controlActive = false
  sviewCTL = window.sctl = new SceneviewController({
    camtarget:new THREE.Vector3(0,0,0),
    display:renderCTL.display,
    dom_evttarget:disp_elem,
    app_evttarget:edCTL.event,
    pickplane:new THREE.Plane(direction.vector.UP, 0),
    UpdcamUpdatepickplane:true,
    followspeed:1/60,
    campos_maxphi:Math.PI * 0.85,
    onCamUpdate:function() {
      controlActive = true
    },

    OrbitTargetMBTN:"rmb",
    ChaseTargetMBTN:"mmb",

    tpmode_fov:60
  })
  sviewCTL.run()

  let aboutBTN
  let toggleAboutBox = function() {
    $("#about").toggle()
    putFloatingElement($("#about")[0], aboutBTN)
  }
  on($("#hideabout"), "click", toggleAboutBox)
  aboutBTN = $("<div>").addClass("btn_active").text("About").click(toggleAboutBox)[0]
  $("#controls").append(aboutBTN)

  renderCTL.build_domOBJ = function(tile, color, location, css_class, event_handlers) {
    if (typeof(tile) == "string") {
     tile = edCTL.tiles[tile]
    }
    if (!tile) {
      return
    }
    if (!color) {
      color = new THREE.Color("white")
    }
    else if (!color.isColor) {
      color = new THREE.Color(color)
    }
    if (!location) {
      location = "#tools"
    }

    let cnv = document.createElement("canvas")
    let elem = $(cnv)
    if (css_class) {
      elem.addClass(css_class)
    }
    if (event_handlers) {
      for (let k in event_handlers) {
        elem.on(k, event_handlers[k])
      }
    }

    $(location).append(elem)

    cnv.width = UI_TILE_SIZE[0]
    cnv.height = UI_TILE_SIZE[1]

    let hilight = false

    //console.log(sz)
    let ctx = cnv.getContext('2d');
    let draw = function() {
      ctx.clearRect(0,0, UI_TILE_SIZE[0], UI_TILE_SIZE[1])

      if (hilight) {
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0

        ctx.strokeStyle = "black"
        ctx.lineWidth = 4
        ctx.strokeRect(1,1, UI_TILE_SIZE[0]-2, UI_TILE_SIZE[1]-2)

        ctx.strokeStyle = color.getStyle()
        ctx.lineWidth = 2
        ctx.strokeRect(1,1, UI_TILE_SIZE[0]-2, UI_TILE_SIZE[1]-2)
      }

      ctx.shadowColor = 'rgba(0, 0, 0, .33333)';
      ctx.shadowOffsetX = UI_TILESHADOW_OFFSET[0]
      ctx.shadowOffsetY = UI_TILESHADOW_OFFSET[1]
      ctx.drawImage(tile.source, tile.x, tile.y, tile.w, tile.h, UI_TILEGRAPHIC_OFFSET[0], UI_TILEGRAPHIC_OFFSET[1], UI_TILEGRAPHIC_SIZE[0], UI_TILEGRAPHIC_SIZE[1]);

      let imgd = ctx.getImageData(0,0, UI_TILE_SIZE[0], UI_TILE_SIZE[1])
      let buf = imgd.data

      let r = color.r
      let g = color.g
      let b = color.b

      for (let i = 0; i < buf.length; i+= 4) {
        buf[i] =   buf[i]   * r
        buf[i+1] = buf[i+1] * g
        buf[i+2] = buf[i+2] * b
      }
      ctx.putImageData(imgd, 0, 0);
    }
    draw()

    elem.mouseover(function() {
      hilight = true
      draw()
    })
    elem.mouseout(function() {
      hilight = false
      draw()
    });

    return elem
  }

  
  let bxtbldr = new BoxTerrain(renderCTL.vxlMAT, renderCTL.uv2)
  let vxc = new VxScene({
    boxterrain:bxtbldr,
    chunks_per_tick:4
  })
  var amblCol = new THREE.Color("white")
  amblCol.setHSL ( 0.125, 1, 0.5 )
  var vambl = new THREE.AmbientLight(amblCol, 0.125)
  var ambl = new THREE.AmbientLight(0xffffff, 0.125)
  vxc.scene.add(ambl)
  vxc.scene.add(vambl)
  let dlight = new THREE.DirectionalLight( 0xffffff, 1 )
  dlight.position.set(300,1000,700)
  vxc.scene.add(dlight)
  
  renderCTL.display.scene.add(vxc.scene)
  
  let put = function(obj, x,y,z, ld=false) {
    if (obj.terrain) {
      if (ld) {
        vxc.loadTerrain(x,y,z, obj.terrain)
      }
      else {
        vxc.setTerrain(x,y,z, obj.terrain)
      }
      return
    }
    let ctn = vxc.get(obj.x,obj.y,obj.z)
    if (ctn.contents) {
      let idx = ctn.contents.indexOf(obj)
      if (idx != -1) {
        ctn.contents.splice(idx,1)
      }
    }
    obj.x = x
    obj.y = y
    obj.z = z
    ctn = vxc.get(x,y,z)
    if (!ctn.contents) {
      ctn.contents = []
      ctn.contents.push(obj)
    }
    if (obj.mdl) {
      if (!obj.mdl.parent) {
        vxc.scene.add(obj.mdl)
      }
      obj.mdl.position.set(x,y,z)
    }
  }
  
  let remove = function(obj) {
    if (obj.terrain) {
      vxc.setTerrain(x,y,z, 0)
      return
    }
    let ctn = vxc.get(obj.x,obj.y,obj.z)
    if (ctn.contents) {
      let idx = ctn.contents.indexOf(obj)
      if (idx != -1) {
        ctn.contents.splice(idx,1)
      }
    }
    if (obj.mdl) {
      if (obj.mdl.parent) {
        obj.mdl.parent.remove(obj)
      }
    }
  }
  
  let cursor3d = {
    x:0,y:0,z:0,
    isDecorative:true,
    mdl:new THREE.Object3D()
  }
  let cubeCursor = getAsset(edCTL.assets, "CubeCursor")
  cursor3d.mdl.add(cubeCursor)
  put(cursor3d,0,0,0)
  
  {(async function Cursor3DControl () {
    let evtman = new NextEventManager()
    
    while (true) {
      let evt = await evtman.next("mousemove")
      let mp3d = sviewCTL.mpos3d
      
      //point
      edCTL.event.dispatchEvent( new Event("mousemove_point"))
        
      let x = Math.round(mp3d.x)
      let y = Math.round(mp3d.y)
      let z = Math.round(mp3d.z)
      
      //cube
      if ( (x != cursor3d.x) | (x != cursor3d.x) | (x != cursor3d.x)) {
        put(cursor3d, x,y,z)
        controlActive = true
        edCTL.event.dispatchEvent(new Event("mousemove_cube"))
      }
      
      //face + alignment
    }
  })()}
  
  let build = function() {
    console.log(cursor3d)
  }
  
  let opSpecs = {
    buildcube: { click:build, drag:build, drag_evttype:"mousemove_cube" }
  }
  
  let handleInput = async function(opspec) {
    let evtman = new NextEventManager()
    outer:
    while (true) {
      let evt = await evtman.next(disp_elem, "mousedown", edCTL.event, "cancel")
      if (evt.type == "cancel") {
        return
      }
      if (opspec.click) { opspec.click() }
      if (opspec.drag_evttype) {
        inner:
        while (true) {
          evt = await evtman.next(disp_elem, "mouseup", edCTL.event, opspec.drag_evttype, "cancel")
          switch(evt.type) {
            case "cancel":
              if (opspec.cancel) { opspec.cancel() }
              return
            case "mouseup":
              if (opspec.release) { opspec.release() }
              break inner
            case opspec.drag_evttype:
              if (opspec.drag) { opspec.drag() }
              break
          }
        }
      }
    }
  }
  
  let tools = {}
  let defineTool = function(spec) {
    tools[spec.name] = {
      spec:spec
    }
  }
  
  let activeTool
  let setTool = function(name) {
    edCTL.event.dispatchEvent(new Event("cancel"))
    activeTool = tools[name]
    let opspec = opSpecs[activeTool.spec.routine]
    
    handleInput(opspec)
  }
  
  defineTool({
    type:"wall",                            // object type indicator
    name:"Wall",                            // Name for reference and display in-editor
    pickMode:"cube",                        // Pick unaligned unit cubes with integer coordinates
    spatialClass:"solid",                   // Tag used in-editor for picking and coexistance checks (not intended to be data)
    spclassPick:["solid"],                  // allow picking against objects of these classes
    spclassCoexist:[],                      // Objects that the defined object may coexist with
    planarPick:true,                        // allow picking against XY, XZ, and YZ planes
    terrain:true,                           // terrain declaration
    routine:"buildcube",                    // Input handler to run while tool is active
    template:["type", "color", "uvscpec"],  // Put these properties in the template
    color:{                                 // Colorable object declaration
      amount:1,                             // Number of [defined] colors 
      default:["white"],                    // default for each defined color
      mutable:[true],                       // indicate which defined colors may be selected by User
      mainIndex:0,                          // "shorthand" color picking assigns to this entry in the color table
    },  
    uvspec:{                                // set of UVs to use for rendering terain (blocks of entries in a texture atlas)
      amount:1,                             // Number of [defined] uvspecs  
      default:[0],                          // default for each defined uvspecs
      mutable:[true],                       // indicate which defined uvspecs may be selected by User
      range:{min:0, max:0},                 // range of allowable values for uvspecs selection
    },
    params:{},                              // arbitrary properties to add to all templates
    lockedParams:{}                         // immutable arbitrary properties to add to all templates
  })
  setTool("Wall")
  
  // Item description display
  // These functions (orthot.showDescription and orthot.updateDescription and orthot.hideDescription) are used to allow items to show tooltips and run graphical
  // visualizarion routines.  These are called as objects or interface-elements are moused-over and moused-out
  /*
  let shownItem
  let tiptext = ""
  edCTL.showDescription = function(item) {
    if (shownItem && shownItem != item) {
      edCTL.hideDescription(shownItem)
    }
    shownItem = item
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
      controlActive = true
    }
  }
  edCTL.updateDescription = function(item) {
    if (item != shownItem) {
      return
    }
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
      controlActive = true
    }
  }

  edCTL.hideDescription = function(item) {
    if (item != shownItem) {
      return
    }
    shownItem = null
    tiptext = ""
    if (item.visualizer) {
      item.visualizer(false)
      controlActive = true
    }
  }
  */


  var run = function run () {
    requestAnimationFrame( run );
    edCTL.event.dispatchEvent(new Event("frame"))
    
    if (controlActive) {
      controlActive = false
      renderCTL.display.render()
    }
    
    //let mpos3d = pickPlanepos(renderCTL.display, evtman.mpos, sviewCTL.pickplane)
    //debug_tip(`${tiptext}<br>
    //Mouse position:  x=${mpos3d.x}, y=${mpos3d.y}, z=${mpos3d.z}`)
  }
  run()
})





















