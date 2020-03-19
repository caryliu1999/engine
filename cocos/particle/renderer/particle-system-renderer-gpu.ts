import { builtinResMgr } from '../../core/3d/builtin';
import { Material } from '../../core/assets';
import { Component } from '../../core/components';
import { GFXAttributeName, GFXFormat } from '../../core/gfx/define';
import { IGFXAttribute } from '../../core/gfx/input-assembler';
import { Mat4, Vec2, Vec4, Quat} from '../../core/math';
import { MaterialInstance, IMaterialInstanceInfo } from '../../core/renderer/core/material-instance';
import { IDefineMap } from '../../core/renderer/core/pass-utils';
import { RenderMode, Space } from '../enum';
import Particle from '../particle';
import { packGradientRange } from '../animator/gradient-range';
import { Pass } from '../../core/renderer';
import { packCurveRangeXYZ, packCurveRangeZ, packCurveRangeXYZW, packCurveRangeN } from '../animator/curve-range';
import { ParticleSystemRendererBase } from './particle-system-renderer-base';

const _tempWorldTrans = new Mat4();
const _tempWorldRot = new Vec4();

let _world_rot_uniform = new Float32Array(4);
let _world_rot = new Quat();


const ATTR_INDEX = {
  POS: 0,
  VERT_IDX: 1,
  VERT_IDY: 2,
  SIZE: 3,
  ANGLE: 4,
  COLOR: 5,
  DIR: 6,
  LIFE_TIME: 7,
  START_TIME: 8,
  RANDOM_SEED: 9
};

const _uvs = [
    0, 0, // bottom-left
    1, 0, // bottom-right
    0, 1, // top-left
    1, 1, // top-right
];

const _sample_num = 32;
const _sample_interval = 1.0 / _sample_num;

const CC_USE_WORLD_SPACE = 'CC_USE_WORLD_SPACE';

const CC_RENDER_MODE = 'CC_RENDER_MODE';
const RENDER_MODE_BILLBOARD = 0;
const RENDER_MODE_STRETCHED_BILLBOARD = 1;
const RENDER_MODE_HORIZONTAL_BILLBOARD = 2;
const RENDER_MODE_VERTICAL_BILLBOARD = 3;
const RENDER_MODE_MESH = 4;

const COLOR_OVER_TIME_MODULE_ENABLE = 'COLOR_OVER_TIME_MODULE_ENABLE';
const ROTATION_OVER_TIME_MODULE_ENABLE = 'ROTATION_OVER_TIME_MODULE_ENABLE';
const SIZE_OVER_TIME_MODULE_ENABLE = 'SIZE_OVER_TIME_MODULE_ENABLE';
const VELOCITY_OVER_TIME_MODULE_ENABLE = 'VELOCITY_OVER_TIME_MODULE_ENABLE';
const FORCE_OVER_TIME_MODULE_ENABLE = 'FORCE_OVER_TIME_MODULE_ENABLE';

const _vert_attr_name = {
    POSITION_STARTTIME: 'a_position_starttime',
    VERT_SIZE_UV: 'a_size_uv',
    VERT_ROTATION_UV: 'a_rotation_uv',
    COLOR: 'a_color',
    DIR_LIFE: 'a_dir_life',
    RANDOM_SEED: 'a_rndSeed'
  };

const _gpu_vert_attr = [
    { name: _vert_attr_name.POSITION_STARTTIME, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.VERT_SIZE_UV, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.VERT_ROTATION_UV, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.COLOR, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.DIR_LIFE, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.RANDOM_SEED, format: GFXFormat.R32F}
];

const _gpu_vert_attr_mesh = [
    { name: _vert_attr_name.POSITION_STARTTIME, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.VERT_SIZE_UV, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.VERT_ROTATION_UV, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.COLOR, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.DIR_LIFE, format: GFXFormat.RGBA32F},
    { name: _vert_attr_name.RANDOM_SEED, format: GFXFormat.R32F},
    { name: GFXAttributeName.ATTR_TEX_COORD, format: GFXFormat.RGB32F },                    // uv,frame idx
    { name: GFXAttributeName.ATTR_TEX_COORD3, format: GFXFormat.RGB32F },                   // mesh position
    { name: GFXAttributeName.ATTR_NORMAL, format: GFXFormat.RGB32F },                       // mesh normal
    { name: GFXAttributeName.ATTR_COLOR1, format: GFXFormat.RGBA8, isNormalized: true },    // mesh color
];

const _matInsInfo: IMaterialInstanceInfo = {
    parent: null!,
    owner: null!,
    subModelIdx: 0,
};

export default class ParticleSystemRendererGPU extends ParticleSystemRendererBase {
    private _defines: IDefineMap;
    private _frameTile_velLenScale: Vec4;
    private _node_scale: Vec4;
    protected _vertAttrs: IGFXAttribute[] = [];
    protected _defaultMat: Material | null = null;
    private _particleNum: number = 0;
    private _vertIndexMap: any = null;
    private _tempParticle: any = null;

    constructor (info: any) {
        super(info);

        this._frameTile_velLenScale = new Vec4(1, 1, 0, 0);
        this._node_scale = new Vec4();
        this._defines = {
            CC_USE_WORLD_SPACE: true,
            CC_USE_BILLBOARD: true,
            CC_USE_STRETCHED_BILLBOARD: false,
            CC_USE_HORIZONTAL_BILLBOARD: false,
            CC_USE_VERTICAL_BILLBOARD: false,
            COLOR_OVER_TIME_MODULE_ENABLE: false,
        };

        this._tempParticle = new Particle(null);
        this._particleNum = 0;
        this._vertIndexMap = new Int8Array(Object.keys(ATTR_INDEX).length);
        this._constructAttributeIndex();
    }

    public _constructAttributeIndex() {
        let offset = 0;
        for (let i = 0; i < _gpu_vert_attr.length; i++) {
            switch (_gpu_vert_attr[i].name) {
            case _vert_attr_name.POSITION_STARTTIME:
                this._vertIndexMap[ATTR_INDEX.POS] = offset;
                this._vertIndexMap[ATTR_INDEX.START_TIME] = offset + 3;
                break;
            case _vert_attr_name.VERT_SIZE_UV:
                this._vertIndexMap[ATTR_INDEX.VERT_IDX] = offset;
                this._vertIndexMap[ATTR_INDEX.SIZE] = offset + 2;
                this._vertIndexMap[ATTR_INDEX.ANGLE] = offset + 3;
                break;
            case _vert_attr_name.VERT_ROTATION_UV:
                this._vertIndexMap[ATTR_INDEX.VERT_IDX] = offset;
                this._vertIndexMap[ATTR_INDEX.SIZE] = offset + 2;
                this._vertIndexMap[ATTR_INDEX.ANGLE] = offset + 3;
                break;
            case _vert_attr_name.COLOR:
                this._vertIndexMap[ATTR_INDEX.COLOR] = offset;
                break;
            case _vert_attr_name.DIR_LIFE:
                this._vertIndexMap[ATTR_INDEX.DIR] = offset;
                this._vertIndexMap[ATTR_INDEX.LIFE_TIME] = offset + 3;
                break;
            case _vert_attr_name.RANDOM_SEED:
                this._vertIndexMap[ATTR_INDEX.RANDOM_SEED] = offset;
                break;
            }
            offset += 4;
        }
    }

    public onInit (ps: Component) {
        super.onInit(ps);
        this._setVertexAttrib();
        this._updateModel();
        this.updateMaterialParams();
    }

    public updateRenderMode () {
        this._setVertexAttrib();
        this._updateModel();
        this.updateMaterialParams();
    }

    public clear () {
        this._particleNum = 0;
        this.updateRenderData();
    }

    public getFreeParticle (): Particle | null {
        if (this._particleNum >= this._particleSystem._capacity) {
            return null;
        }

        return this._tempParticle;
    }

    public setNewParticle (p: Particle) {
        this._model!.addGPUParticleVertexData(p, this._particleNum, this._particleSystem._time);
        this._particleNum++;
    }

    public updateParticles (dt: number) {
        let pSize = this._model!._vertAttrsFloatCount * this._model!._vertCount;
        for (let i = 0; i < this._particleNum; ++i) {
            let pBaseIndex = i * pSize;
            if (this._particleSystem._time - this._model!._vdataF32![pBaseIndex + this._vertIndexMap[ATTR_INDEX.START_TIME]] > this._model!._vdataF32![pBaseIndex + this._vertIndexMap[ATTR_INDEX.LIFE_TIME]]) {
                let lastParticleBaseIndex = (this._particleNum - 1) * pSize;
                this._model!._vdataF32!.copyWithin(pBaseIndex, lastParticleBaseIndex, lastParticleBaseIndex + pSize);
                i--;
                this._particleNum--;
            }
        }

        this.updateShaderUniform(dt);

        return this._particleNum;
    }

    // internal function
    public updateRenderData () {
        // update vertex buffer
        this._model!.updateIA(this._particleNum);
    }

    public updateShaderUniform (dt: number) {
        const mat: Material | null = this._particleSystem.getMaterialInstance(0) || this._defaultMat;
        if (!mat) {
            return;
        }

        let pass = mat.passes[0];
        pass.setUniform(pass.getHandle("u_psTime")!, this._particleSystem._time);
        pass.setUniform(pass.getHandle('u_detla')!, dt);

        this._particleSystem.node.getWorldRotation(_world_rot)
        Quat.toArray(_world_rot_uniform, _world_rot);
        Vec4.fromArray(_tempWorldRot, _world_rot_uniform);
        let handle = pass.getHandle("u_worldRot");
        pass.setUniform(handle!, _tempWorldRot);
    }

    public initShaderUniform () {
        const mat: Material | null = this._particleSystem.getMaterialInstance(0) || this._defaultMat;
        if (!mat) {
            return;
        }

        let pass = mat.passes[0];

        pass.setUniform(pass.getHandle("scale")!, this._node_scale);
        pass.setUniform(pass.getHandle("frameTile_velLenScale")!, this._frameTile_velLenScale);

        // force
        let forceModule = this._particleSystem.forceOvertimeModule;
        this._defines[FORCE_OVER_TIME_MODULE_ENABLE] = forceModule.enable;
        if (forceModule.enable) {
            let texture = packCurveRangeXYZ(_sample_num, forceModule.x, forceModule.y, forceModule.z);
            let handle = pass.getHandle("force_over_time_tex0");
            let binding = Pass.getBindingFromHandle(handle!);
            pass.bindTextureView(binding, texture.getGFXTextureView()!);
            let spaceHandle = pass.getHandle("u_force_space");
            pass.setUniform(spaceHandle!, forceModule.space);
            let modeHandle = pass.getHandle("u_force_mode");
            pass.setUniform(modeHandle!, texture.height);
        }

        // velocity
        let velocityModule = this._particleSystem.velocityOvertimeModule;
        this._defines[VELOCITY_OVER_TIME_MODULE_ENABLE] = velocityModule.enable;
        if (velocityModule.enable) {
            let texture = packCurveRangeXYZW(_sample_num, velocityModule.x, velocityModule.y, velocityModule.z, velocityModule.speedModifier);
            let handle = pass.getHandle("velocity_over_time_tex0");
            let binding = Pass.getBindingFromHandle(handle!);
            pass.bindTextureView(binding, texture.getGFXTextureView()!);
            let spaceHandle = pass.getHandle("u_velocity_space");
            pass.setUniform(spaceHandle!, velocityModule.space);
            let modeHandle = pass.getHandle("u_velocity_mode");
            pass.setUniform(modeHandle!, texture.height);
        }

        // color module
        let colorModule = this._particleSystem.colorOverLifetimeModule;
        this._defines[COLOR_OVER_TIME_MODULE_ENABLE] = colorModule.enable;
        if (colorModule.enable) {
            let texture = packGradientRange(_sample_num, colorModule.color);
            let handle = pass.getHandle("color_over_time_tex0");
            let binding = Pass.getBindingFromHandle(handle!);
            pass.bindTextureView(binding, texture.getGFXTextureView()!);
            let modeHandle = pass.getHandle("u_color_mode");
            pass.setUniform(modeHandle!, texture.height);
        }

        // rotation module
        let roationModule = this._particleSystem.rotationOvertimeModule;
        this._defines[ROTATION_OVER_TIME_MODULE_ENABLE] = roationModule.enable;
        if (roationModule.enable) {
            let texture;
            if (roationModule.separateAxes) {
                texture = packCurveRangeXYZ(_sample_num, roationModule.x, roationModule.y, roationModule.z);
            } else {
                texture = packCurveRangeZ(_sample_num, roationModule.z);
            }  
            
            let handle = pass.getHandle("rotation_over_time_tex0");
            let binding = Pass.getBindingFromHandle(handle!);
            pass.bindTextureView(binding, texture.getGFXTextureView()!);
            let modeHandle = pass.getHandle("u_rotation_mode");
            pass.setUniform(modeHandle!, texture.height);
        }

        // size module
        let sizeModule = this._particleSystem.sizeOvertimeModule;
        this._defines[SIZE_OVER_TIME_MODULE_ENABLE] = sizeModule.enable;
        if (sizeModule.enable) {
            let texture;
            if (sizeModule.separateAxes) {
                texture = packCurveRangeXYZ(_sample_num, sizeModule.x, sizeModule.y, sizeModule.z);
            } else {
                texture = packCurveRangeN(_sample_num, sizeModule.size);
            }
            
            let handle = pass.getHandle("size_over_time_tex0");
            let binding = Pass.getBindingFromHandle(handle!);
            pass.bindTextureView(binding, texture.getGFXTextureView()!);
            let modeHandle = pass.getHandle("u_size_mode");
            pass.setUniform(modeHandle!, texture.height);
        }
    }

    public getParticleCount (): number {
        return this._particleNum;
    }

    public onMaterialModified (index: number, material: Material) {
        this._updateModel();
        this.updateMaterialParams();
    }

    public onRebuildPSO (index: number, material: Material) {
        if (this._model && index === 0) {
            this._model.setSubModelMaterial(0, material);
        }
    }

    private _setVertexAttrib () {
        switch (this._renderInfo!.renderMode) {
            case RenderMode.StrecthedBillboard:
                //this._vertAttrs = _vertex_attrs_stretch.slice();
                break;
            case RenderMode.Mesh:
                this._vertAttrs = _gpu_vert_attr_mesh.slice();
                break;
            default:
                this._vertAttrs = _gpu_vert_attr.slice();
        }
    }

    public updateMaterialParams () {
        if (!this._particleSystem) {
            return;
        }
        if (this._particleSystem.sharedMaterial != null && this._particleSystem.sharedMaterial._effectAsset._name.indexOf('particle-gpu') === -1) {
            // reset material
            this._particleSystem.setMaterial(null, 0);
        }
        if (this._particleSystem.sharedMaterial == null && this._defaultMat == null) {
            _matInsInfo.parent = builtinResMgr.get<Material>('default-particle-gpu-material');
            _matInsInfo.owner = this._particleSystem;
            _matInsInfo.subModelIdx = 0;
            this._defaultMat = new MaterialInstance(_matInsInfo);
        }
        const mat: Material | null = this._particleSystem.getMaterialInstance(0) || this._defaultMat;

        this._particleSystem.node.getWorldMatrix(_tempWorldTrans);
        switch (this._particleSystem.scaleSpace) {
            case Space.Local:
                this._particleSystem.node.getScale(this._node_scale);
                break;
            case Space.World:
                this._particleSystem.node.getWorldScale(this._node_scale);
                break;
        }

        if (this._particleSystem._simulationSpace === Space.World) {
            this._defines[CC_USE_WORLD_SPACE] = true;
        } else {
            this._defines[CC_USE_WORLD_SPACE] = false;
        }
        let renderMode = this._renderInfo!.renderMode;
        if (renderMode === RenderMode.Billboard) {
            this._defines[CC_RENDER_MODE] = RENDER_MODE_BILLBOARD;
        } else if (renderMode === RenderMode.StrecthedBillboard) {
            this._defines[CC_RENDER_MODE] = RENDER_MODE_STRETCHED_BILLBOARD;
            this._frameTile_velLenScale.z = this._renderInfo!.velocityScale;
            this._frameTile_velLenScale.w = this._renderInfo!.lengthScale;
        } else if (renderMode === RenderMode.HorizontalBillboard) {
            this._defines[CC_RENDER_MODE] = RENDER_MODE_HORIZONTAL_BILLBOARD;
        } else if (renderMode === RenderMode.VerticalBillboard) {
            this._defines[CC_RENDER_MODE] = RENDER_MODE_VERTICAL_BILLBOARD;
        } else if (renderMode === RenderMode.Mesh) {
            this._defines[CC_RENDER_MODE] = RENDER_MODE_MESH;
        } else {
            console.warn(`particle system renderMode ${renderMode} not support.`);
        }

        if (this._particleSystem.textureAnimationModule.enable) {
            Vec2.set(this._frameTile_velLenScale, this._particleSystem.textureAnimationModule.numTilesX, this._particleSystem.textureAnimationModule.numTilesY);
        }

        this.initShaderUniform();

        mat!.recompileShaders(this._defines);

        if (this._model) {
            this._model.setSubModelMaterial(0, mat);
        }
    }
}