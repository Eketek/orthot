export { renderCTL, inputCTL, sviewCTL, orthotCTL }

import { tt, initLIBEK, Display, loadMuch, loadZIP, assignMaterials, pickPlanepos, debug_tip } from '../libek/libek.js'
import { UVspec, buildVariantMaterial, ManagedColor } from '../libek/shader.js'
import { Manager } from '../libek/event.js'
import { QueryTriggeredButtonControl, SceneviewController } from '../libek/control.js'
import { direction } from '../libek/direction.js'
import { Hackground } from '../libek/hackground.js'
import { clamp } from '../libek/util.js'

import { Zone } from './zone.js'



/*  Orthot III application logic
    This prepares global controls, loads game data, configures base objects (default materials),
*/

// Global rendering properties & controls (Mainly, materials and managed shader properties)
var renderCTL = {
  uv2:new UVspec()
}

//Input controller.  Mouse & keyboard
var inputCTL = {}

// Screen-view controller:  Camera controller which performs orbitting, following, and a bit of flying.
var sviewCTL

var MAIN_GDATA_PACK = {
  name:"MainGdataPack",
  mainAreaname:"MainArea",
  zones:{}
}

//Level data, high-level state, and "Orthot" functions
var orthotCTL = {
  assets:{},      
  gdatapack:MAIN_GDATA_PACK,
  tiles:{},  
  version:"0.3.0"
}


$(async function() {

  initLIBEK() 
  
  let disp_elem = $("#game").attr("tabindex", "0").get(0)
  disp_elem.addEventListener( 'contextmenu', function(evt) {evt.preventDefault()} )  
  disp_elem.focus()
  renderCTL.display = Display(disp_elem, true)
  
  //renderCTL.display.renderer.setClearColor( "blue", 0.1 )
  //console.log(renderCTL)
  
  let TextureProps = {
    magFilter:THREE.NearestFilter,
    anisotropy:4,
  }
  
  await loadMuch( 
    orthotCTL.assets,
    {url:"orthot/textures/patterns.png", properties:TextureProps},
    {url:"orthot/textures/wall_8bit_fg.png", properties:TextureProps},
    {url:"orthot/textures/symbols.png", properties:TextureProps},
  )
  await loadZIP(orthotCTL.assets, 'orthot/models.zip')
  await loadZIP(MAIN_GDATA_PACK.zones, 'orthot/ekvxdat.zip')
    
  orthotCTL.tiles.key = {
    source:orthotCTL.assets.symbols.image,
    x:0, y:0, w:64, h:64
  }
    
  let UI_TILEGRAPHIC_SIZE = [32,32]
  let UI_TILEGRAPHIC_OFFSET = [0, 0]
  let UI_TILESHADOW_SIZE = 8
  let UI_TILESHADOW_OFFSET = [5,3]
  let UI_TILE_SIZE = [37,35]
    
  renderCTL.fg = new ManagedColor("yellow")
  renderCTL.bg1 = new ManagedColor("orange")
  renderCTL.bg2 = new ManagedColor("green")
         
  renderCTL.vxlMAT = buildVariantMaterial("standard", {
    map:orthotCTL.assets.wall_8bit_fg, 
    bkgtex:orthotCTL.assets.patterns,
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
  
  let manmats = ["hsl(25, 80%, 60%)", "blue", "hsl(15, 100%, 15%)", "black", {color:"black", metalness:1}, {color:"white", emissive:"yellow", emissiveIntensity:1}]
  
  assignMaterials(orthotCTL.assets.man, manmats)
  assignMaterials(orthotCTL.assets.man2, manmats)
  assignMaterials(orthotCTL.assets.man_walk, manmats)
  assignMaterials(orthotCTL.assets.man_push, manmats)
  assignMaterials(orthotCTL.assets.man_pushwalk, manmats)
  assignMaterials(orthotCTL.assets.man_climb, manmats)
  assignMaterials(orthotCTL.assets.man_leap, manmats)
  assignMaterials(orthotCTL.assets.man_pushleap, manmats)
  assignMaterials(orthotCTL.assets.man_slide1, manmats)
  assignMaterials(orthotCTL.assets.man_slide2, manmats)
  assignMaterials(orthotCTL.assets.man_slide3, manmats)
  assignMaterials(orthotCTL.assets.man_slide4, manmats)
  assignMaterials(orthotCTL.assets.man_slide5, manmats)
  
  assignMaterials(orthotCTL.assets.scene_portal, {color:"white", emissive:"white", emissiveIntensity:0.4 }, {color:"cyan", transparent:true, opacity:0.5})
  assignMaterials(orthotCTL.assets.portal_pane, "white", "yellow", {color:"blue", transparent:true, opacity:0.25}, "white" )
  assignMaterials(orthotCTL.assets.pushblock, ["white", "red", "black"])
  assignMaterials(orthotCTL.assets.lock, ["white", "black"])
  assignMaterials(orthotCTL.assets.crate, ["hsl(20, 100%, 50%)", "black", "hsl(25, 90%, 25%)", "hsl(22, 100%, 55%)" ])  
  assignMaterials(orthotCTL.assets.iceblock, [{color:"white", metalness:0.25, roughness:1 }, "blue", "cyan", "hsl(175, 100%, 75%)", {color:"blue", transparent:true, opacity:0.25, metalness:1, roughness:0.5}])
  assignMaterials(orthotCTL.assets.icefloor, [{color:"white", metalness:0.25, roughness:1 }, "blue", "cyan", "hsl(175, 100%, 75%)", {color:"blue", transparent:true, opacity:0.25, metalness:1, roughness:0.5}, "black"])
  assignMaterials(orthotCTL.assets.mouse, ["hsl(20, 100%, 50%)", "hsl(0, 100%, 70%)", {color:"green", emissive:"green", emissiveIntensity:1}, "hsl(30, 100%, 20%)"]) 
  assignMaterials(orthotCTL.assets.moose, ["hsl(20, 100%, 50%)", "black", "hsl(30, 100%, 20%)", {color:"red", emissive:"red", emissiveIntensity:1}]) 
  
  let markmats = [{color:"green", emissive:"green", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]
  let cursormats = [{color:"white", emissive:"white", emissiveIntensity:0.333}, {color:"black", transparent:true, opacity:0.4}]
  
  assignMaterials(orthotCTL.assets.CubeMark, markmats)
  assignMaterials(orthotCTL.assets.FaceMark, markmats)
  assignMaterials(orthotCTL.assets.CubeCursor, cursormats)
  assignMaterials(orthotCTL.assets.FaceCursor, cursormats)
  
  var evtman = new Manager( disp_elem )
  inputCTL.EventManager = evtman
  
  inputCTL.keystate = new QueryTriggeredButtonControl({
    buttons:"arrows space keys:w a s d",
    eventmanager:evtman,
    readheldbuttons:true,
    onInputAvailable:function() {
      if (orthotCTL.ActiveZone) {
        orthotCTL.ActiveZone.inputAvailable()
      }
    }
  })
  inputCTL.keystate.run()
    
  sviewCTL = new SceneviewController({
    camtarget:new THREE.Vector3(0,0,0),
    display:renderCTL.display,
    eventmanager:evtman,
    pickplane:new THREE.Plane(direction.vector.UP, 0),
    UpdcamUpdatepickplane:true,
    followspeed:1/60,
    campos_maxphi:Math.PI * 0.85,
    
    OrbitTargetMBTN:"rmb",
    ChaseTargetMBTN:"lmb",    
    RefocusTargetMBTN:"mmb",
    RefocusUpdatepickplane:true,
    RefocusLen:700,
    QuickRefocusLen:150,
    
    tpmode_fov:60,
    fpmode_fov:75,
    fpmode_enabled:true,
    fpmode_abs_offset:new THREE.Vector3(0,0.25,0),
    fpmode_z_offset:-0.5,
    fpmode_notify:function(fpmode_on, fpmode_moused) {
      if (orthotCTL.ActiveZone) {
        orthotCTL.ActiveZone.setFPmode(fpmode_on, fpmode_moused)
      }
    }
  })    
  sviewCTL.run()
  
  let levelSelector = $("#loadPuzzle")[0]
  for (let i = levelSelector.length-1; i >= 0; i--) {
    levelSelector.remove(i)
  }
  for (let name in MAIN_GDATA_PACK.zones) {
    levelSelector.add($("<option>").text(name)[0])
  }

  orthotCTL.loadScene = function(arg, loc) {
    let ekvx = arg
    if (typeof(arg) == "string") {
      ekvx = orthotCTL.gdatapack.zones[arg]
      if (ekvx == undefined) {  
        console.log(`No puzzle named "${arg}" to load...  Loading the default (MainArea)`)
        arg = orthotCTL.gdatapack.mainAreaname
        ekvx = orthotCTL.gdatapack.zones[arg]
      }
    }
    else if (!arg) {
      arg = orthotCTL.gdatapack.mainAreaname
      ekvx = orthotCTL.gdatapack.zones[arg]
    }
    if (orthotCTL.ActiveZone) {
      renderCTL.display.scene.remove(orthotCTL.ActiveZone.scene)
      orthotCTL.ActiveZone.unload()
    }
    orthotCTL.ActiveZone = new Zone(ekvx, loc)
    renderCTL.display.scene.add(orthotCTL.ActiveZone.scene)
    
    for (let i = 0; i < levelSelector.length; i++) {
      if (levelSelector.options[i].value == arg) {
        levelSelector.selectedIndex = i
        return
      }
    }
    levelSelector.selectedIndex = -1
  }
  
 
  
  $("#loadPuzzle").on("input", ()=>{  
    let lvlName = levelSelector.options[levelSelector.selectedIndex].value
    orthotCTL.loadScene(lvlName)
    disp_elem.focus()
  });
  
  orthotCTL.loadScene("MainArea")
  
  let resetELEM = $("<div>").addClass("btn_active").text("RESET").click(function() {
    if (orthotCTL.ActiveZone) {
      orthotCTL.ActiveZone.reset()
      disp_elem.focus()
    }
  })
  $("#rightside").append(resetELEM)
  
  
  renderCTL.build_domOBJ = function(tile, color, location, css_class, event_handlers) {
    if (typeof(tile) == "string") {
      tile = orthotCTL.tiles[tile]
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
      location = "#inventory"
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
    
    //console.log(sz)
    let ctx = cnv.getContext('2d');
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
    return elem
  }
    
  // Item description display
  // These functions (orthot.showDescription and orthot.updateDescription and orthot.hideDescription) are used to allow items to show tooltips and run graphical 
  // visualizarion routines.  These are called as objects or interface-elements are moused-over and moused-out
  let shownItem
  let tiptext = ""
  orthotCTL.showDescription = function(item) {
    if (shownItem && shownItem != item) {
      orthotCTL.hideDescription(shownItem)
    }
    shownItem = item
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
    }
  }
  orthotCTL.updateDescription = function(item) {
    if (item != shownItem) {
      return
    }
    tiptext = item.description ? item.description : ""
    if (item.visualizer) {
      item.visualizer(true)
    }
  }
  
  orthotCTL.hideDescription = function(item) {
    if (item != shownItem) {
      return
    }
    shownItem = null
    tiptext = ""
    if (item.visualizer) {
      item.visualizer(false)
    }
  }

  let hg = new Hackground(renderCTL.display.background)
  hg.yOFS = 0
  hg.bkgColor = "black"
  hg.layers = [
    { baseOfs:0,
      baseGen:(col, numCols)=>{
        return Math.sin(4*col/numCols)/(Math.PI)
      },
      range:0.1,
      gradGen:(col, numCols)=> {
        return (Math.sin(11*col/numCols)/(Math.PI)*4 + Math.random())/5
      },
      gradients:[
        {
          pos:-1,
          color:"black"
        },
        {
          pos:-0.33,
          color:"black"
        },
        {
          pos:-0.1,
          color:"purple",
          range:0.005
        },
        {
          pos:0.00,
          color:"pink",
          range:0.015
        },
        {
          pos:0.1,
          color:"lightblue",
          startColor:"yellow",
          range:0.01
        },
        {
          pos:0.1,
          color:"lightblue",
          startColor:"cyan",
          range:0.005
        },
        {
          pos:0.2,
          color:"lightblue",
          range:0.02
        },
        {
          pos:0.3,
          color:"darkblue",
          startColor:"blue",
          range:0.005
        },
        {
          pos:0.55,
          color:"darkblue",
          startColor:"lime",
          range:0.025
        },
        {
          pos:0.6,
          color:"green",
          startColor:"darkgreen",
          range:0.025
        },
        {
          pos:0.64,
          color:"black",
          startColor:"yellow",
          range:0.015
        },
        {
          pos:0.65,
          color:"orange",
          startColor:"darkorange",
          range:0.005
        },
        {
          pos:0.8,
          color:"black",
          range:0.005
        },
        {
          pos:0.88,
          color:"black",
          startColor:"hsl(20,70%,40%)",
          range:0.015
        },
        {
          pos:0.9,
          color:"hsl(20,70%,10%)",
          range:0.005
        },
        {
          pos:1,
          color:"black",
          range:0.005
        },
        {
          pos:1.2,
          color:"black",
          startColor:"hsl(0,100%,5%)",
          range:0.1
        },
        {
          pos:1.4,
          color:"hsl(330,100%,2.5%)",
          range:0.05
        },
        {
          pos:1.5,
          color:"black"
        },
        {
          pos:3,
          color:"black"
        }
      ]
    }
  ]
  hg.resolution = 12
  //hg.update()
  hg.draw()
  let hgyscale = -1000
  let hgxscale = 200
  //hg.rotate(15)
  let prevCamPhi = sviewCTL.campos.phi
  let prevCamTheta = sviewCTL.campos.theta
  hg.yOFS = (prevCamPhi/Math.PI-0.4) * hgyscale
  hg.update()
      
	var run = function run () {	   
		requestAnimationFrame( run );
		evtman.dispatch_libek_event("frame")
  	
  	if (orthotCTL.ActiveZone) {  	 
  	  orthotCTL.ActiveZone.onFrame()
  	}  	
	  renderCTL.display.render()
    //hg.rotate(17/16)
    //console.log(sviewCTL.campos.phi)
    let camTheta = sviewCTL.campos.theta
    if (camTheta != prevCamTheta) {
      let hgRotamt = ((camTheta - prevCamTheta) / (2*Math.PI)) * (-hgxscale)
      prevCamTheta = camTheta
      prevCamPhi = sviewCTL.campos.phi
      //hg.offset += diff
      hg.yOFS = (prevCamPhi/Math.PI-0.4) * hgyscale
      hg.rotate(hgRotamt)    
      hg.update()
    }
    else if ( (prevCamPhi != sviewCTL.campos.phi) ) {
      prevCamPhi = sviewCTL.campos.phi
      hg.yOFS = (prevCamPhi/Math.PI-0.4) * hgyscale
      hg.update()
    } 
    
    
    //hg.update()
    //hg.draw()
	  
	  let mpos3d = pickPlanepos(renderCTL.display, evtman.mpos, sviewCTL.pickplane)
		debug_tip(`${tiptext}<br>
		Mouse position:  x=${mpos3d.x}, y=${mpos3d.y}, z=${mpos3d.z}`)
	}	
	run()
  
  //console.log(assets)
})





















