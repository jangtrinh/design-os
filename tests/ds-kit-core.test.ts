import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { parseKitSpec } from '../src/core/ds-kit-parse.js';
import { prepareKit, validateKit } from '../src/core/ds-kit-validate.js';
import { emitKitTheme } from '../src/core/ds-kit-theme.js';
import { hashKitBytes, readKitFile, verifyKitFiles } from '../src/core/ds-kit-files.js';
import { KitError, type KitSpec } from '../src/core/ds-kit-types.js';
// Test-only standards validator already installed through the test toolchain; kernel stays dependency-free.
const Ajv2020 = createRequire(import.meta.url)('ajv/dist/2020.js').default as new (options:{strict:boolean}) => {compile:(schema:unknown)=>(value:unknown)=>boolean};
const schemaValid = new Ajv2020({strict:false}).compile(JSON.parse(readFileSync(new URL('../schemas/ds-kit.schema.json',import.meta.url),'utf8')) as unknown);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); });
const tokens = {color:{canvas:{$type:'color',$value:'#FFFFFF',$extensions:{'mode.dark':{$value:'#000000'}}},ink:{$type:'color',$value:'{color.canvas}'}}};
function fixture(): {root:string;spec:KitSpec;write:(path:string,value:unknown)=>void} {
  const root = mkdtempSync(join(tmpdir(),'ds-kit-')); roots.push(root);
  const write = (path:string,value:unknown):void => {
    const target = join(root,path); mkdirSync(join(target,'..'),{recursive:true});
    writeFileSync(target,typeof value === 'string' ? value : JSON.stringify(value));
  };
  const records = Array.from({length:40},(_,i) => ({name:`Owner ${i+1} · Δ`,category:'owner',markup:'',tokensUsed:['color.canvas'],variants:['Size=Large'],states:['default','disabled']}));
  write('source/registry.json',{version:'0.1.0',components:records}); write('source/tokens.json',tokens);
  // Machine fixture only: distinct declared exports exercise admission, not host build/render proof.
  write('src/components.tsx',records.map((_,i)=>`export const Owner${i+1} = () => <button disabled>Owner ${i+1}</button>;`).join('\n'));
  write('src/theme.css',emitKitTheme(tokens,{background:'color.canvas'})); write('render.html','<button disabled>Owner</button>');
  write('package.json',{}); write('package-lock.json',{});
  const spec:KitSpec = {version:1,name:'Owner',intent:'Faithful',target:'react-shadcn-tailwind',minimumComponents:25,
    sources:[{id:'owner',kind:'registry',path:'source/registry.json',hash:hashKitBytes(readFileSync(join(root,'source/registry.json'))),scope:'complete',limitations:[]}],
    tokens:'source/tokens.json',theme:'src/theme.css',aliases:{background:'color.canvas'},
    mappings:records.map((record,i)=>({sourceId:`owner:${i}`,name:record.name,disposition:'component',implementation:{path:'src/components.tsx',export:`Owner${i+1}`,strategy:'reuse',primitives:[]},markup:'render.html',variants:['Size=Large'],states:['default','disabled'],cases:[`render-${i}`,`review-${i}`,`behavior-${i}`]})),
    artifacts:['source/registry.json','source/tokens.json','src/components.tsx','src/theme.css','render.html','package.json','package-lock.json'],
    cases:[{id:'build',kind:'build',subject:'kit',description:'Build actual exports and verify import closure'},{id:'review',kind:'review',subject:'kit',description:'Source completeness review'},...records.flatMap((_,i)=>(['render','review','behavior'] as const).map(kind=>({id:`${kind}-${i}`,kind,subject:`owner:${i}`,description:'Size=Large default disabled'})))],evidence:'evidence/receipt.json'};
  write('kit.json',spec); return {root,spec,write};
}
function receipt(f:ReturnType<typeof fixture>):void {
  const prepared = prepareKit(f.root);
  f.write('evidence/build.log','Host build log'); f.write('evidence/render.html','<button disabled>Owner</button>'); f.write('evidence/review.txt','Host source and render review');
  f.write(f.spec.evidence,{version:1,contentHash:prepared.contentHash,cases:f.spec.cases.map(c=>({id:c.id,outcome:'passed',files:[c.kind === 'build' ? 'evidence/build.log' : c.kind === 'render' ? 'evidence/render.html' : 'evidence/review.txt'],note:'Host assertion bound to content'}))});
}
function figmaFixture(): ReturnType<typeof fixture> {
  const f=fixture();
  const raw={components:f.spec.mappings.map((m,i)=>({id:`node-${i}`,name:m.name,type:'COMPONENT_SET',variantAxes:{Size:['Large']},states:['default','disabled']})),tokens:[{id:'v1',name:'color/canvas',type:'COLOR',valuesByMode:{Light:{r:1,g:1,b:1},Dark:{r:0,g:0,b:0}}}]};
  f.write('source/registry.json',raw); f.write('source/tokens.json',{color:{canvas:{$type:'color',$value:'#FFFFFF',$extensions:{'mode.dark':{$value:'#000000'}}}}});
  f.spec.sources[0]!.kind='figma'; f.spec.sources[0]!.hash=hashKitBytes(readFileSync(join(f.root,'source/registry.json')));
  f.spec.mappings.forEach((m,i)=>{m.sourceId=`owner:node-${i}`;m.tokensUsed=['color.canvas'];});
  f.spec.cases.forEach(c=>{if(c.subject!=='kit')c.subject=`owner:node-${c.subject.split(':')[1]}`;});
  f.write('src/theme.css',emitKitTheme(JSON.parse(readFileSync(join(f.root,'source/tokens.json'),'utf8')),f.spec.aliases)); f.write('kit.json',f.spec); return f;
}
describe('source-bound kit core',()=>{
  it('binds all forty exact names and captured token usage in a deterministic read-only lock',()=>{
    const f=fixture(); receipt(f); const lock=validateKit(f.root);
    expect(prepareKit(f.root).capturedCount).toBe(40); expect(lock.registry.components).toHaveLength(40); expect(lock.registry.components.some(c=>c.name==='Owner 40 · Δ')).toBe(true);
    expect(lock.registry.components.every(c=>c.tokensUsed.includes('color.canvas'))).toBe(true);
    expect(validateKit(f.root)).toEqual(lock); expect(lock.content.some(c=>c.path==='kit.json')).toBe(true);
    verifyKitFiles(f.root,lock.content); expect(()=>readKitFile(f.root,'kit.lock.json')).toThrow();
  });
  it.each([2,38])('accepts %i explicitly declared owner families with unique exports',count=>{
    const f=fixture(); const capture=JSON.parse(readFileSync(join(f.root,'source/registry.json'),'utf8'));
    capture.components=capture.components.slice(0,count); f.write('source/registry.json',capture);
    f.spec.minimumComponents=count===2?0:25; f.spec.sources[0]!.hash=hashKitBytes(readFileSync(join(f.root,'source/registry.json')));
    f.spec.mappings=f.spec.mappings.slice(0,count); const ids=new Set(f.spec.mappings.map(m=>m.sourceId)); f.spec.cases=f.spec.cases.filter(c=>c.subject==='kit' || ids.has(c.subject));
    f.write('kit.json',f.spec); expect(schemaValid(f.spec)).toBe(true); receipt(f); expect(prepareKit(f.root).capturedCount).toBe(count); expect(validateKit(f.root).registry.components).toHaveLength(count);
  });
  it('does not let the floor hide missing item forty',()=>{
    const f=fixture(); f.spec.minimumComponents=0; f.spec.mappings.pop(); f.write('kit.json',f.spec);
    expect(prepareKit(f.root).capturedCount).toBe(40); expect(prepareKit(f.root).findings).toContainEqual(expect.objectContaining({code:'KIT_UNRESOLVED',sourceId:'owner:39'}));
    expect(()=>validateKit(f.root)).toThrow(KitError);
  });
  it.each(['empty','inflated'] as const)('reports source-derived count for %s mappings',shape=>{
    const f=fixture(); f.spec.mappings=shape==='empty'?[]:[...f.spec.mappings,{...f.spec.mappings[0]!,sourceId:'owner:invented'}]; f.write('kit.json',f.spec);
    const prepared=prepareKit(f.root); expect(prepared.capturedCount).toBe(40); expect(prepared.complete).toBe(false);
  });
  it.each(['icon','screen','excluded'] as const)('does not let the floor hide discarded normal registry item forty: %s',disposition=>{
    const f=fixture(); f.spec.mappings[39]!.disposition=disposition; f.spec.mappings[39]!.reason='Host reviewed disposition'; f.write('kit.json',f.spec);
    expect(prepareKit(f.root).findings).toContainEqual(expect.objectContaining({code:'KIT_DISPOSITION',sourceId:'owner:39'}));
    receipt(f); expect(()=>validateKit(f.root)).toThrow(KitError);
  });
  it.each([['icon','icon',false],['screen','screen',false],['owner','excluded',true]] as const)('permits evidenced declared %s disposition %s', (category,disposition,deprecated)=>{
    const f=fixture(); const capture=JSON.parse(readFileSync(join(f.root,'source/registry.json'),'utf8'));
    capture.components[39].category=category; capture.components[39].deprecated=deprecated; f.write('source/registry.json',capture);
    f.spec.sources[0]!.hash=hashKitBytes(readFileSync(join(f.root,'source/registry.json')));
    f.spec.mappings[39]!.disposition=disposition; f.spec.mappings[39]!.reason='Source-authored category or deprecation reviewed'; f.write('kit.json',f.spec);
    receipt(f); expect(validateKit(f.root).registry.components).toHaveLength(39);
  });
  it('blocks category-mismatched dispositions even with a review',()=>{
    const f=fixture(); const capture=JSON.parse(readFileSync(join(f.root,'source/registry.json'),'utf8')); capture.components[39].category='icon'; f.write('source/registry.json',capture);
    f.spec.sources[0]!.hash=hashKitBytes(readFileSync(join(f.root,'source/registry.json'))); f.spec.mappings[39]!.disposition='screen'; f.spec.mappings[39]!.reason='Reviewed'; f.write('kit.json',f.spec);
    expect(prepareKit(f.root).findings).toContainEqual(expect.objectContaining({code:'KIT_DISPOSITION',sourceId:'owner:39'}));
  });
  it.each(['component','icon','screen'] as const)('preserves captured figmaNode facts while guarding %s projection',disposition=>{
    const f=fixture(); const capture=JSON.parse(readFileSync(join(f.root,'source/registry.json'),'utf8')); capture.components[39].figmaNode='components/owner-40.figma.json';
    if(disposition!=='component') {capture.components[39].category=disposition; f.spec.mappings[39]!.disposition=disposition; f.spec.mappings[39]!.reason='Source category reviewed';}
    f.write('source/registry.json',capture); const sourceBytes=readFileSync(join(f.root,'source/registry.json')); f.spec.sources[0]!.hash=hashKitBytes(sourceBytes); f.write('kit.json',f.spec); const prepared=prepareKit(f.root);
    if(disposition==='component') {expect(prepared.complete).toBe(false); expect(prepared.findings).toContainEqual(expect.objectContaining({code:'KIT_FIGMA_SIDECAR',sourceId:'owner:39'})); receipt(f); expect(()=>validateKit(f.root)).toThrow(KitError);}
    else {receipt(f); const lock=validateKit(f.root); expect(lock.registry.components).toHaveLength(39); expect(lock.registry.components.every(c=>c.figmaNode===undefined)).toBe(true);}
    expect(readFileSync(join(f.root,'source/registry.json'))).toEqual(sourceBytes); expect(JSON.parse(sourceBytes.toString()).components[39].figmaNode).toBe('components/owner-40.figma.json');
  });
  it.each(['registry','figma'] as const)('blocks one export counted as multiple %s families',kind=>{
    const f=kind==='registry'?fixture():figmaFixture(); f.spec.mappings[39]!.implementation={...f.spec.mappings[0]!.implementation!}; f.write('kit.json',f.spec);
    expect(prepareKit(f.root).findings).toContainEqual(expect.objectContaining({code:'KIT_IMPLEMENTATION_DUPLICATE',sourceId:f.spec.mappings[39]!.sourceId}));
    receipt(f); expect(()=>validateKit(f.root)).toThrow(KitError);
  });
  it.each(['variants','states'] as const)('requires captured %s and explicit case coverage',field=>{
    const f=fixture(); f.spec.mappings[0]![field]=[]; f.spec.cases.filter(c=>c.subject==='owner:0').forEach(c=>c.description='vague review'); f.write('kit.json',f.spec);
    expect(prepareKit(f.root).findings.filter(x=>x.code==='KIT_COVERAGE').length).toBeGreaterThan(0);
  });
  it('rejects option-prefix matches in case coverage',()=>{
    const f=fixture(); f.spec.cases.filter(c=>c.subject==='owner:0').forEach(c=>c.description='Size=Larger default disabledExtra'); f.write('kit.json',f.spec);
    expect(prepareKit(f.root).findings.filter(x=>x.code==='KIT_COVERAGE' && x.sourceId==='owner:0')).toHaveLength(2);
  });
  it('blocks changed captures and normalized name collisions',()=>{
    const f=fixture(); const raw=JSON.parse(readFileSync(join(f.root,'source/registry.json'),'utf8'));
    raw.components[39].name=' owner 1 · δ '; f.write('source/registry.json',raw);
    const codes=prepareKit(f.root).findings.map(x=>x.code); expect(codes).toContain('KIT_SOURCE_CHANGED'); expect(codes).toContain('KIT_DUPLICATE');
  });
  it('binds host token declarations and rejects nonexistent usage',()=>{
    const f=fixture(); f.spec.mappings[0]!.tokensUsed=['color.missing']; f.write('kit.json',f.spec);
    expect(prepareKit(f.root).findings.some(x=>x.code==='KIT_TOKEN_REFERENCE')).toBe(true);
  });
  it('emits mode-local alias resolutions with explicit Tailwind aliases',()=>{
    const css=emitKitTheme(tokens,{background:'color.ink'});
    expect(css).toContain('[data-ds-mode="dark"]'); expect(css).toContain('--color-ink: #000000;'); expect(css).toContain('@theme inline');
    expect(()=>emitKitTheme(tokens,{background:'color.absent'})).toThrow();
    expect(()=>emitKitTheme({color:{a:{$type:'color',$value:'#fff',$extensions:{'mode.Dark A':{$value:'#000'},'mode.dark-a':{$value:'#111'}}}}},{})).toThrow();
  });
  it('preserves literal owner/mode bytes with multiple scalar aliases',()=>{
    const owner={...tokens,radius:{base:{$type:'dimension',$value:'4px'}}};
    expect(emitKitTheme(owner,{radius:'radius.base',background:'color.ink'})).toBe(':root {\n  --color-canvas: #FFFFFF;\n  --color-ink: #FFFFFF;\n  --radius-base: 4px;\n  --background: var(--color-ink);\n  --color-background: var(--color-ink);\n  --radius: var(--radius-base);\n}\n[data-ds-mode="dark"] {\n  --color-canvas: #000000;\n  --color-ink: #000000;\n  --radius-base: 4px;\n  --background: var(--color-ink);\n  --color-background: var(--color-ink);\n  --radius: var(--radius-base);\n}\n@theme inline {\n  --color-background: var(--color-ink);\n  --radius: var(--radius-base);\n}\n');
    expect(emitKitTheme(tokens,{})).toBe(':root {\n  --color-canvas: #FFFFFF;\n  --color-ink: #FFFFFF;\n}\n[data-ds-mode="dark"] {\n  --color-canvas: #000000;\n  --color-ink: #000000;\n}\n');
  });
  it('permits matching owner consumer names and enforces shadcn role types',()=>{
    const owner={color:{background:{$type:'color',$value:'#fff'},ink:{$type:'color',$value:'#000'}},number:{count:{$type:'number',$value:2}},radius:{base:{$type:'dimension',$value:'4px'}}};
    expect(emitKitTheme(owner,{background:'color.background'})).toContain('--color-background: var(--color-background)');
    expect(()=>emitKitTheme(owner,{background:'color.ink'})).toThrow(/collision/);
    expect(()=>emitKitTheme(owner,{foreground:'number.count'})).toThrow(/type mismatch/);
    expect(()=>emitKitTheme(owner,{radius:'color.ink'})).toThrow(/type mismatch/);
    expect(emitKitTheme(owner,{radius:'radius.base'})).toContain('--radius: var(--radius-base)');
  });
  it('references same-owner theme identities without replacing light/dark literals or distinct consumer variables',()=>{
    const owner={color:{background:{$type:'color',$value:'#123456',$extensions:{'mode.dark':{$value:'#abcdef'}}},ink:{$type:'color',$value:'#111111',$extensions:{'mode.dark':{$value:'#eeeeee'}}}},radius:{sm:{$type:'dimension',$value:'13px',$extensions:{'mode.dark':{$value:'21px'}}}}};
    expect(emitKitTheme(owner,{background:'color.background',foreground:'color.ink','radius-sm':'radius.sm'})).toBe(':root {\n  --color-background: #123456;\n  --color-ink: #111111;\n  --radius-sm: 13px;\n  --background: var(--color-background);\n  --foreground: var(--color-ink);\n  --color-foreground: var(--color-ink);\n}\n[data-ds-mode="dark"] {\n  --color-background: #abcdef;\n  --color-ink: #eeeeee;\n  --radius-sm: 21px;\n  --background: var(--color-background);\n  --foreground: var(--color-ink);\n  --color-foreground: var(--color-ink);\n}\n@theme inline {\n  --color-foreground: var(--color-ink);\n}\n@theme inline reference {\n  --color-background: var(--color-background);\n  --radius-sm: var(--radius-sm);\n}\n');
    expect(()=>emitKitTheme({...owner,dimension:{corner:{$type:'dimension',$value:'5px'}}},{'radius-sm':'dimension.corner'})).toThrow('Alias collision: radius-sm');
  });
  it('rejects malformed mode aliases and byte-different theme',()=>{
    expect(()=>emitKitTheme({color:{a:{$type:'color',$value:'#fff',$extensions:{'mode.dark':{$value:'{color.missing}'}}}}},{})).toThrow();
    const f=fixture(); f.write('src/theme.css','/* wrong theme */'); expect(prepareKit(f.root).findings.some(x=>x.code==='KIT_THEME')).toBe(true);
  });
  it('allows prepare before evidence but rejects missing, stale and incomplete receipts',()=>{
    const f=fixture(); expect(prepareKit(f.root).complete).toBe(true); expect(()=>validateKit(f.root)).toThrow(); receipt(f);
    const r=JSON.parse(readFileSync(join(f.root,f.spec.evidence),'utf8')); r.cases.pop(); f.write(f.spec.evidence,r); expect(()=>validateKit(f.root)).toThrow();
    receipt(f); f.write('src/components.tsx','export const Owner = () => <button>changed</button>;'); expect(()=>validateKit(f.root)).toThrow(/subject/);
  });
  it.each(['../escape','/absolute','src/../escape','src\\escape','src//escape','C:/escape'])('rejects path %s',path=>{
    const f=fixture(); expect(()=>readKitFile(f.root,path)).toThrow(KitError);
  });
  it('rejects undeclared files, symlinks and case collisions',()=>{
    const f=fixture(); f.write('hidden.ts','export {}'); expect(()=>prepareKit(f.root)).toThrow(/Undeclared/);
    rmSync(join(f.root,'hidden.ts')); symlinkSync(join(f.root,'source/tokens.json'),join(f.root,'link')); expect(()=>prepareKit(f.root)).toThrow(/Symlink/);
    rmSync(join(f.root,'link')); f.spec.artifacts.push('SRC/theme.css'); f.write('kit.json',f.spec); expect(()=>prepareKit(f.root)).toThrow(/colliding/);
  });
  it('reconciles all raw Figma IDs, modes and host-declared token uses',()=>{
    const f=figmaFixture(); receipt(f); const lock=validateKit(f.root);
    expect(prepareKit(f.root).capturedCount).toBe(40); expect(lock.registry.components).toHaveLength(40); expect(lock.registry.components.every(c=>c.tokensUsed.includes('color.canvas'))).toBe(true);
  });
  it.each(['lost-mode','skipped','collision','missing-mode','duplicate-id'])('blocks Figma %s without source writes',hazard=>{
    const f=figmaFixture(); const raw=JSON.parse(readFileSync(join(f.root,'source/registry.json'),'utf8'));
    if(hazard==='lost-mode') raw.tokens[0].valuesByMode.Dark={type:'VARIABLE_ALIAS',id:'absent'};
    if(hazard==='skipped') raw.tokens.push({id:'bool',name:'flag',type:'BOOLEAN',value:true});
    if(hazard==='collision') raw.tokens.push({...raw.tokens[0],id:'v2'});
    if(hazard==='missing-mode') raw.tokens.push({id:'v2',name:'color/second',type:'COLOR',valuesByMode:{Light:{r:1,g:1,b:1}}});
    if(hazard==='duplicate-id') raw.components[39].id=raw.components[0].id;
    f.write('source/registry.json',raw); const before=readFileSync(join(f.root,'source/registry.json'));
    f.spec.sources[0]!.hash=hashKitBytes(before); f.write('kit.json',f.spec);
    expect(prepareKit(f.root).complete).toBe(false); expect(()=>validateKit(f.root)).toThrow(KitError);
    expect(readFileSync(join(f.root,'source/registry.json'))).toEqual(before);
  });
  it('blocks partial captures, wrong source names and unbound case subjects',()=>{
    const f=fixture(); f.spec.sources[0]!.scope='partial'; f.spec.mappings[0]!.name='Guessed'; f.spec.cases[0]!.subject='absent'; f.write('kit.json',f.spec);
    const codes=prepareKit(f.root).findings.map(x=>x.code); expect(codes).toContain('KIT_SCOPE'); expect(codes).toContain('KIT_NAME'); expect(codes).toContain('KIT_CASE');
  });
  it.each(['source/tokens.json','kit.json','src/theme.css','src/components.tsx','render.html'])('detects sealed content tampering: %s',path=>{
    const f=fixture(); receipt(f); const lock=validateKit(f.root);
    writeFileSync(join(f.root,path),readFileSync(join(f.root,path)).toString()+' ');
    expect(()=>verifyKitFiles(f.root,lock.content)).toThrow(/mismatch/);
  });
  it('rejects symlinked dependency roots and generated trees used as import artifacts',()=>{
    const f=fixture(); symlinkSync(join(f.root,'source'),join(f.root,'node_modules')); expect(()=>prepareKit(f.root)).toThrow(/Symlink/); unlinkSync(join(f.root,'node_modules'));
    f.spec.artifacts.push('dist/component.tsx'); f.write('kit.json',f.spec); expect(()=>prepareKit(f.root)).toThrow(/Generated/);
  });
  it('rejects forged extra receipt cases and evidence byte tampering',()=>{
    const f=fixture(); receipt(f); const lock=validateKit(f.root); f.write('evidence/build.log','changed'); expect(()=>verifyKitFiles(f.root,lock.evidence)).toThrow(/mismatch/);
    receipt(f); const r=JSON.parse(readFileSync(join(f.root,f.spec.evidence),'utf8')); r.cases.push({...r.cases[0],id:'extra'}); f.write(f.spec.evidence,r); expect(()=>validateKit(f.root)).toThrow(/Unknown/);
  });
  it.each([['name',64],['intent',512]] as const)('rejects nonportable kit %s before verification', (field,max)=>{
    const f=fixture(); f.spec[field]='x'.repeat(max); f.write('kit.json',f.spec); expect(schemaValid(f.spec)).toBe(true); receipt(f); expect(()=>validateKit(f.root)).not.toThrow();
    f.spec[field]+='x'; f.write('kit.json',f.spec); expect(schemaValid(f.spec)).toBe(false); expect(()=>prepareKit(f.root)).toThrow(KitError);
  });
  it('uses manifest UTF-16 limits without capping source owner display names',()=>{
    const f=fixture(); f.spec.name='🟢'.repeat(32); expect(()=>parseKitSpec(f.spec)).not.toThrow(); f.spec.name+='🟢'; expect(()=>parseKitSpec(f.spec)).toThrow(KitError);
    f.spec.name='Kit'; const capture=JSON.parse(readFileSync(join(f.root,'source/registry.json'),'utf8')); capture.components[39].name='Owner '+ 'x'.repeat(100); f.write('source/registry.json',capture);
    f.spec.sources[0]!.hash=hashKitBytes(readFileSync(join(f.root,'source/registry.json'))); f.spec.mappings[39]!.name=capture.components[39].name; f.write('kit.json',f.spec); expect(schemaValid(f.spec)).toBe(true); receipt(f); expect(validateKit(f.root).registry.components.some(c=>c.name===capture.components[39].name)).toBe(true);
  });
  it('matches public schema and parser on structural counterexamples',()=>{
    const f=fixture(); expect(schemaValid(f.spec)).toBe(true); expect(()=>parseKitSpec(f.spec)).not.toThrow();
    const cases:unknown[]=[{...f.spec,minimumComponents:-1},{...f.spec,minimumComponents:0.5},{...f.spec,minimumComponents:9007199254740992},{...f.spec,extra:true},{...f.spec,name:' '},{...f.spec,name:'Owner\u0000'},
      ...['../escape','a/','a//b','a/CON.txt','a/trailing.','a/trailing ','a\\b','/absolute'].map(tokens=>({...f.spec,tokens})),
      {...f.spec,artifacts:['same','same']},{...f.spec,aliases:{' ':'color.canvas'}},{...f.spec,mappings:[{...f.spec.mappings[0],tokensUsed:[2]}]},
      {...f.spec,mappings:[{sourceId:'owner:0',name:'Owner',disposition:'component'}]},
      {...f.spec,sources:[{...f.spec.sources[0],id:'owner:bad'}]},{...f.spec,sources:[{...f.spec.sources[0],hash:f.spec.sources[0]!.hash+'\n'}]}];
    for(const input of cases) {expect(schemaValid(input)).toBe(false); expect(()=>parseKitSpec(input)).toThrow(KitError);}
    const positive={...f.spec,name:'Owner 🟢',minimumComponents:0,tokens:'a b/tokens.json',aliases:{},mappings:[{sourceId:'owner:0',name:'Exact owner',disposition:'unresolved'}]};
    expect(schemaValid(positive)).toBe(true); expect(()=>parseKitSpec(positive)).not.toThrow();
  });
  it('rejects unknown keys, failed cases, empty evidence and receipt self-reference',()=>{
    const f=fixture(); f.write('kit.json',{...f.spec,unknown:true}); expect(()=>prepareKit(f.root)).toThrow(/unknown/); f.write('kit.json',f.spec); receipt(f);
    const r=JSON.parse(readFileSync(join(f.root,f.spec.evidence),'utf8')); r.cases[0].files=[f.spec.evidence]; f.write(f.spec.evidence,r); expect(()=>validateKit(f.root)).toThrow(/self-referential/);
    receipt(f); f.write('evidence/build.log',''); expect(()=>validateKit(f.root)).toThrow(/Empty/);
    receipt(f); r.cases[0].files=['evidence/build.log']; r.cases[0].outcome='failed'; f.write(f.spec.evidence,r); expect(()=>validateKit(f.root)).toThrow(/failed/);
  });
});

describe('kit theme alias ownership and CSS member safety', () => {
  const aliasFixtures = [
    { label: 'color', tokens: { color: { canvas: { $type: 'color', $value: '#ffffff', $extensions: { 'mode.dark': { $value: '#111111' } } }, ink: { $type: 'color', $value: '#222222' } } }, first: 'background', prefixed: 'color-background', target: 'color.canvas', other: 'color.ink', direct: '--color-background', owner: '--color-canvas' },
    { label: 'font', tokens: { font: { body: { $type: 'fontFamily', $value: 'Inter', $extensions: { 'mode.dark': { $value: 'Arial' } } }, heading: { $type: 'fontFamily', $value: 'Georgia' } } }, first: 'sans', prefixed: 'font-sans', target: 'font.body', other: 'font.heading', direct: '--font-sans', owner: '--font-body' },
  ];

  it.each(aliasFixtures.flatMap(f => [false, true].map(mode => ({ ...f, mode }))))('rejects generated $label consumer claimed by another target (mode=$mode)', ({ tokens: owner, first, prefixed, target, other, mode }) => {
    const value = JSON.parse(JSON.stringify(owner)) as Record<string, Record<string, { $extensions?: unknown }>>;
    if (!mode) for (const group of Object.values(value)) for (const leaf of Object.values(group)) delete leaf.$extensions;
    expect(() => emitKitTheme(value, { [first]: target, [prefixed]: other })).toThrow(expect.objectContaining({ code: 'KIT_ALIAS' }));
    expect(() => emitKitTheme(value, { [prefixed]: other, [first]: target })).toThrow(expect.objectContaining({ code: 'KIT_ALIAS' }));
  });

  it.each(aliasFixtures)('accepts identical-target $label aliases with stable unique declarations in every mode', ({ tokens: owner, first, prefixed, target, direct, owner: ownerVar }) => {
    const css = emitKitTheme(owner, { [first]: target, [prefixed]: target });
    expect(emitKitTheme(owner, { [prefixed]: target, [first]: target })).toBe(css);
    expect(css).toContain('[data-ds-mode="dark"]');
    const scopes = [...css.matchAll(/\{([^{}]*)\}/g)].map(match => match[1]!);
    expect(scopes).toHaveLength(3); // root, dark override, Tailwind consumer bridge.
    for (const scope of scopes) {
      const declarations = [...scope.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(match => match[1]);
      expect(new Set(declarations).size).toBe(declarations.length);
      expect(scope.split(`${direct}: var(${ownerVar});`)).toHaveLength(2);
    }
  });

  const unsafeValues = [
    { label: 'scalar string', type: 'string', valid: 'safe', unsafe: 'safe; } body { color: red' },
    { label: 'shadow member', type: 'shadow', valid: { offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px', color: '#111111' }, unsafe: { offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px', color: '#111111; } body { color: red' } },
    { label: 'typography member', type: 'typography', valid: { fontFamily: 'Inter', fontSize: '16px' }, unsafe: { fontFamily: 'Inter; } body { color: red', fontSize: '16px' } },
    { label: 'font stack member', type: 'fontFamily', valid: ['Inter', 'sans-serif'], unsafe: ['Inter', 'sans-serif; } body { color: red'] },
    { label: 'typography emitted identifier', type: 'typography', valid: { fontSize: '16px' }, unsafe: { 'fontSize;injected': '16px' } },
    { label: 'shadow emitted identifier', type: 'shadow', valid: { offsetY: '2px' }, unsafe: { 'offsetY}injected': '2px' } },
    { label: 'nested typography object', type: 'typography', valid: { fontSize: '16px' }, unsafe: { fontSize: { value: '16px' } } },
    { label: 'nested shadow object', type: 'shadow', valid: { offsetY: '2px' }, unsafe: { offsetY: { value: '2px' } } },
  ];
  it.each(unsafeValues.flatMap(value => ['base', 'dark'].map(layer => ({ ...value, layer }))))('rejects unsafe $label in $layer values with KIT_THEME', ({ type, valid, unsafe, layer }) => {
    const value = { owner: { value: { $type: type, $value: layer === 'base' ? unsafe : valid, ...(layer === 'dark' ? { $extensions: { 'mode.dark': { $value: unsafe } } } : {}) } } };
    expect(() => emitKitTheme(value, {})).toThrow(expect.objectContaining({ code: 'KIT_THEME' }));
  });

  it('preserves legitimate resolved typography/shadow members and font stack arrays in both modes', () => {
    const owner = {
      color: { ink: { $type: 'color', $value: '#111111', $extensions: { 'mode.dark': { $value: '#eeeeee' } } } },
      font: { body: { $type: 'fontFamily', $value: ['Inter', 'Noto Sans', 'sans-serif'] } },
      shadow: { card: { $type: 'shadow', $value: { offsetX: '0px', offsetY: '{spacing.offset}', blur: '{spacing.blur}', spread: '0px', color: '{color.ink}' } } },
      spacing: { blur: { $type: 'dimension', $value: '8px' }, offset: { $type: 'dimension', $value: '2px' } },
      text: { body: { $type: 'typography', $value: { fontFamily: '{font.body}', fontSize: '16px', fontWeight: 400, lineHeight: 1.5 } } },
    };
    const root = ':root {\n  --color-ink: #111111;\n  --font-body: Inter, "Noto Sans", sans-serif;\n  --shadow-card: 0px 2px 8px 0px #111111;\n  --shadow-card-offset-x: 0px;\n  --shadow-card-offset-y: 2px;\n  --shadow-card-blur: 8px;\n  --shadow-card-spread: 0px;\n  --shadow-card-color: #111111;\n  --spacing-blur: 8px;\n  --spacing-offset: 2px;\n  --text-body-font-family: Inter, "Noto Sans", sans-serif;\n  --text-body-font-size: 16px;\n  --text-body-font-weight: 400;\n  --text-body-line-height: 1.5;\n}\n';
    expect(emitKitTheme(owner, {})).toBe(root + root.replace(':root', '[data-ds-mode="dark"]').replaceAll('#111111', '#eeeeee'));
  });
});

describe('kit theme lexical CSS boundary', () => {
  const reproduced = [
    { label: 'text string opens a comment', type: 'string', safe: 'owner', unsafe: '/*' },
    { label: 'typography fontFamily opens a comment', type: 'typography', safe: { fontFamily: 'Inter', fontSize: '16px' }, unsafe: { fontFamily: '/*', fontSize: '16px' } },
    { label: 'font array opens a comment', type: 'fontFamily', safe: ['Inter', 'sans-serif'], unsafe: ['/*', 'sans-serif'] },
    { label: 'font array quote breaks emitter wrapping', type: 'fontFamily', safe: ['Inter Name', 'sans-serif'], unsafe: ['Inter " Name', 'sans-serif'] },
  ];
  it.each(reproduced.flatMap(value => ['base', 'dark'].map(layer => ({ ...value, layer }))))('rejects reproduced $label in $layer with KIT_THEME', ({ type, safe, unsafe, layer }) => {
    const owner = { text: { owner: { $type: type, $value: layer === 'base' ? unsafe : safe, ...(layer === 'dark' ? { $extensions: { 'mode.dark': { $value: unsafe } } } : {}) } } };
    expect(() => emitKitTheme(owner, {})).toThrow(expect.objectContaining({ code: 'KIT_THEME' }));
  });

  const brokenSyntax = [
    { label: 'unclosed double quote', value: '"Be Vietnam Pro' },
    { label: 'unclosed single quote', value: "'JetBrains Mono" },
    { label: 'unclosed parenthesis', value: 'calc(1px + 2px' },
    { label: 'unexpected closing parenthesis', value: '1px)' },
    { label: 'unclosed bracket', value: '[owner' },
    { label: 'unexpected closing bracket', value: 'owner]' },
    { label: 'crossed delimiters', value: '([owner)]' },
    { label: 'dangling escape', value: 'owner' + String.fromCharCode(92) },
    { label: 'dangling escape inside quote', value: '"owner' + String.fromCharCode(92) },
    { label: 'closing comment without opener', value: 'owner*/' },
    { label: 'newline control', value: 'owner\nvalue' },
    { label: 'tab control', value: 'owner\tvalue' },
    { label: 'NUL control', value: 'owner\u0000value' },
    { label: 'DEL control', value: 'owner\u007fvalue' },
  ];
  it.each(brokenSyntax.flatMap(value => ['base', 'dark'].map(layer => ({ ...value, layer }))))('rejects $label in $layer scalar values with KIT_THEME', ({ value, layer }) => {
    const owner = { text: { owner: { $type: 'string', $value: layer === 'base' ? value : 'owner', ...(layer === 'dark' ? { $extensions: { 'mode.dark': { $value: value } } } : {}) } } };
    expect(() => emitKitTheme(owner, {})).toThrow(expect.objectContaining({ code: 'KIT_THEME' }));
  });

  it.each(['Inter \' Name', 'Inter' + String.fromCharCode(92) + ' Name'].flatMap(value => ['base', 'dark'].map(layer => ({ value, layer }))))('rejects unsafe font array entry $value in $layer without modifying the shared emitter', ({ value, layer }) => {
    const owner = { font: { body: { $type: 'fontFamily', $value: layer === 'base' ? [value, 'sans-serif'] : ['Inter Name', 'sans-serif'], ...(layer === 'dark' ? { $extensions: { 'mode.dark': { $value: [value, 'sans-serif'] } } } : {}) } } };
    expect(() => emitKitTheme(owner, {})).toThrow(expect.objectContaining({ code: 'KIT_THEME' }));
  });

  it.each([
    String.raw`"Owner \" Name"`,
    String.raw`'Owner \' Name'`,
    String.raw`"C:\\Fonts\\Owner"`,
    'calc(100% - (2 * 1rem))',
    '"Owner (Body) [Regular]"',
  ])('preserves balanced scalar quotes, escapes and delimiters: %s', value => {
    const owner = { text: { owner: { $type: 'string', $value: value, $extensions: { 'mode.dark': { $value: value } } } } };
    expect(emitKitTheme(owner, {})).toBe(`:root {\n  --text-owner: ${value};\n}\n[data-ds-mode="dark"] {\n  --text-owner: ${value};\n}\n`);
  });

  it('preserves actual owner quoted font stacks and resolved legitimate composites', () => {
    // Exact scalar stacks from the owner capture; keep tests independent of its mutable private pilot.
    const sans = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", sans-serif';
    const mono = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
    const owner = {
      font: { mono: { $type: 'fontFamily', $value: mono }, sans: { $type: 'fontFamily', $value: sans } },
      shadow: { card: { $type: 'shadow', $value: { offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px', color: 'rgba(0, 0, 0, 0.2)' } } },
      text: { body: { $type: 'typography', $value: { fontFamily: '{font.sans}', fontSize: '16px' } } },
    };
    expect(emitKitTheme(owner, {})).toBe(`:root {\n  --font-mono: ${mono};\n  --font-sans: ${sans};\n  --shadow-card: 0px 2px 8px 0px rgba(0, 0, 0, 0.2);\n  --shadow-card-offset-x: 0px;\n  --shadow-card-offset-y: 2px;\n  --shadow-card-blur: 8px;\n  --shadow-card-spread: 0px;\n  --shadow-card-color: rgba(0, 0, 0, 0.2);\n  --text-body-font-family: ${sans};\n  --text-body-font-size: 16px;\n}\n`);
  });
});
