import * as THREE from 'three';

// Dark still water: layered moving ripples, a fresnel sky tint, a moon/key
// glint, and fog. It surrounds the island arenas (the pond, the hub).
export class Water {
  constructor(scene, radius = 90) {
    this.u = {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x06120f) }, uShallow: { value: new THREE.Color(0x1b3a32) },
      uSky: { value: new THREE.Color(0x2a4034) }, uLight: { value: new THREE.Color(0xc8e08a) }, uLightDir: { value: new THREE.Vector3(.4, .6, -.6).normalize() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.u]), fog: true, transparent: false,
      vertexShader: `varying vec3 vW; varying vec3 vView;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; vView = cameraPosition - w.xyz; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; uniform vec3 uDeep, uShallow, uSky, uLight, uLightDir; varying vec3 vW; varying vec3 vView;
        #include <fog_pars_fragment>
        vec2 wave(vec2 p, float t){ return vec2(sin(p.x*0.9 + t*0.7) + sin(p.y*1.3 - t*0.5)*0.6 + sin((p.x+p.y)*2.1 + t*1.1)*0.25,
                                               cos(p.y*0.8 - t*0.6) + cos(p.x*1.7 + t*0.4)*0.5 + cos((p.x-p.y)*2.6 - t*1.3)*0.2); }
        void main(){
          vec2 g = wave(vW.xz * 0.7, uTime) * 0.06 + wave(vW.xz * 2.3, uTime * 1.6) * 0.025;
          vec3 n = normalize(vec3(g.x, 1.0, g.y));
          vec3 v = normalize(vView);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 c = mix(uDeep, uShallow, 0.35 + g.x * 2.0);
          c = mix(c, uSky, fres * 0.8);
          vec3 h = normalize(uLightDir + v);
          c += uLight * pow(max(dot(n, h), 0.0), 180.0) * 1.6;
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    });
    this.u = mat.uniforms;
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -0.25;
    scene.add(this.mesh);
  }
  update(dt) { this.u.uTime.value += dt; }
}
