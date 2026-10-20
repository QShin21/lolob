using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

// External, bounded, read-only observer sampler. No injected code or game function calls.
public sealed class RiftCastObserverReader : IDisposable {
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr handle, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr read);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    const string SupportedHash = "EE3C887B4579AEAB12CA77B2A43CC1CC3411A8AA30BC43D2DFEA856F6CE497C8";
    IntPtr handle; long imageBase; int attachedPid; DateTime attachedStart;
    public void Dispose() { if(handle != IntPtr.Zero) CloseHandle(handle); handle=IntPtr.Zero; attachedPid=0; }
    static Dictionary<string,object> Obj(params object[] pairs) { var d=new Dictionary<string,object>(); for(int i=0;i<pairs.Length;i+=2)d[(string)pairs[i]]=pairs[i+1];return d; }
    byte[] Read(long address, int size) {
        if(address<65536 || address>0x7fffffff0000 || size<0 || size>65536)throw new InvalidDataException("invalid-address");
        byte[] bytes=new byte[size]; UIntPtr read;
        if(!ReadProcessMemory(handle,new IntPtr(address),bytes,(UIntPtr)size,out read)||read.ToUInt64()!=(ulong)size)throw new IOException("read-failed");
        return bytes;
    }
    long Ptr(long a) { return BitConverter.ToInt64(Read(a,8),0); }
    int Int(long a) { return BitConverter.ToInt32(Read(a,4),0); }
    float Float(long a) { float f=BitConverter.ToSingle(Read(a,4),0);if(float.IsNaN(f)||float.IsInfinity(f))throw new InvalidDataException("invalid-number");return f; }
    float Range(long a,float min,float max) {float f=Float(a);if(f<min||f>max)throw new InvalidDataException("out-of-range");return f;}
    string String(long a) {
        var bytes=Read(a,32);long n=BitConverter.ToInt64(bytes,16),cap=BitConverter.ToInt64(bytes,24);
        if(n<1||n>80||cap<n||cap>4096)throw new InvalidDataException("invalid-string");
        return Encoding.ASCII.GetString(cap>15?Read(BitConverter.ToInt64(bytes,0),(int)n):bytes,0,(int)n);
    }
    string CString(long a) {var bytes=Read(a,128);int n=Array.IndexOf(bytes,(byte)0);if(n<1||n>100)return "";return Encoding.ASCII.GetString(bytes,0,n);}
    Dictionary<string,object> Spell(long hero,int index,float time) {
        long slot=Ptr(hero+0x3be0+index*8);if(slot==0)return Obj("state","unknown");
        int level=Int(slot+0x28);float end=Range(slot+0x30,-1,200000),duration=Float(slot+0x74);
        if(level<0||level>6)return Obj("state","unknown");
        // Form changes can retain a negative historical duration after expiry.
        if(duration>10000||duration<0&&end>time)return Obj("state","unknown");
        return Obj("level",level,"readyAt",Math.Max(0,end),"totalCooldown",Math.Max(0,duration),
          "state",index<4&&level==0?"unlearned":index>=6&&level==0?"unknown":end>time?"cooldown":"ready");
    }
    Dictionary<string,object> Buffs(long hero,float time) {
        long start=Ptr(hero+0x2e68),end=Ptr(hero+0x2e70);long count=(end-start)/16;
        if(start<65536||end<start||(end-start)%16!=0||count>256)throw new InvalidDataException("buff-list");
        var result=Obj("baron",false,"elder",false);
        for(int i=0;i<count;i++) {
            long buff=Ptr(start+i*16);if(buff==0)continue;
            float from=Float(buff+0x18),until=Float(buff+0x1c);
            if(from>time||until<=time||Int(buff+0x38)<=0)continue;
            string name=CString(Ptr(Ptr(buff+0x10)+8)).ToLowerInvariant();
            if(name=="exaltedwithbaronnashor") {result["baron"]=true;result["baronExpiresAt"]=until;}
            if(name=="aspectofthedragon") {result["elder"]=true;result["elderExpiresAt"]=until;}
        }
        return result;
    }
    IEnumerable<Dictionary<string,object>> ActiveBuffs(long obj,float time) {
        long start=Ptr(obj+0x2e68),end=Ptr(obj+0x2e70);
        if(start<65536||end<start||(end-start)%16!=0||(end-start)/16>256)yield break;
        for(long entry=start;entry<end;entry+=16) {
            long buff=Ptr(entry);if(buff==0)continue;
            float from=Float(buff+0x18),until=Float(buff+0x1c);
            if(from>time||until<=time||Int(buff+0x38)<=0)continue;
            yield return Obj("name",CString(Ptr(Ptr(buff+0x10)+8)).ToLowerInvariant(),"until",until);
        }
    }
    static string DragonElement(string name) {
        if(name.Contains("infernal")||name.Contains("fire"))return "fire";
        if(name.Contains("ocean")||name.Contains("water"))return "water";
        if(name.Contains("mountain")||name.Contains("earth"))return "earth";
        if(name.Contains("cloud")||name.Contains("air"))return "air";
        if(name.Contains("hextech"))return "hextech";
        if(name.Contains("chemtech"))return "chemtech";
        return null;
    }
    object NeutralObjectives(long heroes,float time) {
        bool elder=false;string element=null;
        for(int i=0;i<10;i++)try {foreach(var buff in ActiveBuffs(Ptr(heroes+i*8),time)) {
            string name=(string)buff["name"];
            if(name.StartsWith("srx_dragonsoulbuff")) {
                if(name.EndsWith("_preview"))element=DragonElement(name);
                else elder=true;
            }
            if(name=="aspectofthedragon")elder=true;
        }} catch { }
        long manager=Ptr(imageBase+0x1ee93b0),list=Ptr(manager+8);int count=Int(manager+16);
        if(count<1||count>2048)throw new InvalidDataException("neutral-list");
        Dictionary<string,object> top=null,bottom=null;float topDue=0,bottomDue=0;
        for(int i=0;i<count;i++)try {
            long obj=Ptr(list+i*8);string name=String(obj+0x41d0).ToLowerInvariant();
            if(!name.StartsWith("sru_"))continue;
            float hp=Range(obj+0x1060,0,200000);if(hp<=0)continue;
            if(name=="sru_baron")top=Obj("kind","baron","state","alive");
            else if(name=="sru_riftherald")top=Obj("kind","herald","state","alive");
            else if(name=="sru_horde")top=Obj("kind","grubs","state","alive");
            else if(name.StartsWith("sru_dragon")) {
                bottom=Obj("kind",name.Contains("elder")?"elder":"dragon","state","alive");
                var current=DragonElement(name);if(current!=null)bottom["element"]=current;
            } else if(name=="sru_camprespawnmarker") {
                float x=Float(obj+0x1e0),z=Float(obj+0x1e8);
                bool upper=Math.Abs(x-5007)<500&&Math.Abs(z-10471)<500;
                bool lower=Math.Abs(x-9866)<500&&Math.Abs(z-4414)<500;
                if(!upper&&!lower)continue;
                foreach(var buff in ActiveBuffs(obj,time)) {
                    string kind=(string)buff["name"];float due=(float)buff["until"];
                    if(kind=="camprespawncountdownhidden")due+=60;
                    else if(kind!="camprespawncountdownvisible")continue;
                    if(due<=time||due>time+900)continue;
                    if(upper)topDue=due;else bottomDue=due;
                }
            }
        } catch { }
        if(top==null) {
            string kind=time<480?"grubs":time<900?"herald":"baron";
            float due=topDue>time?topDue:time<480?480:time<900?900:time<1200?1200:0;
            top=Obj("kind",kind,"state",due>time?"countdown":"unknown");if(due>time)top["dueAt"]=due;
        }
        if(bottom==null) {
            float due=bottomDue>time?bottomDue:time<300?300:0;
            bottom=Obj("kind",elder?"elder":"dragon","state",due>time?"countdown":"unknown");
            if(due>time)bottom["dueAt"]=due;if(!elder&&element!=null)bottom["element"]=element;
        }
        return new object[]{top,bottom};
    }
    public object Sample() {
        try {
            var processes=Process.GetProcessesByName("League of Legends");
            if(processes.Length!=1) {foreach(var p in processes)p.Dispose();Dispose();return Obj("ok",false,"reason",processes.Length==0?"game-not-running":"ambiguous-process");}
            using(var process=processes[0]) {
                if(handle==IntPtr.Zero||attachedPid!=process.Id||attachedStart!=process.StartTime) {
                    Dispose();var module=process.MainModule;
                    string hash;using(var sha=SHA256.Create())using(var file=File.OpenRead(module.FileName))hash=BitConverter.ToString(sha.ComputeHash(file)).Replace("-","");
                    if(hash!=SupportedHash)return Obj("ok",false,"reason","unsupported-build","version",module.FileVersionInfo.FileVersion);
                    handle=OpenProcess(0x1010,false,process.Id);if(handle==IntPtr.Zero)return Obj("ok",false,"reason","access-unavailable");
                    attachedPid=process.Id;attachedStart=process.StartTime;imageBase=module.BaseAddress.ToInt64();
                }
                float time=Range(imageBase+0x1efa788,0,200000);
                long manager=Ptr(imageBase+0x1ee9370),list=Ptr(manager+8);int count=Int(manager+16);
                if(count!=10)throw new InvalidDataException("roster-incomplete");
                var players=new List<object>();var unique=new HashSet<string>();
                for(int i=0;i<count;i++) {
                    long hero=Ptr(list+i*8);string champion=String(hero+0x41d0);int side=Read(hero+0x239,1)[0];
                    if(!System.Text.RegularExpressions.Regex.IsMatch(champion,"^[A-Za-z0-9]{2,40}$")||(side!=1&&side!=2)||!unique.Add(side+":"+champion))throw new InvalidDataException("roster-invalid");
                    float hp=Range(hero+0x1060,0,200000),maxHp=Range(hero+0x1088,1,200000);
                    float resource=Range(hero+0x340,0,200000),maxResource=Range(hero+0x368,0,200000);
                    int level=Int(hero+0x4be0);if(level<1||level>30||hp>maxHp+1||resource>maxResource+1)throw new InvalidDataException("vitals-invalid");
                    var spells=new List<object>();for(int j=0;j<13;j++) {
                        try {spells.Add(Spell(hero,j,time));} catch {spells.Add(Obj("state","unknown"));}
                    }
                    var player=Obj("champion",champion,"networkId",BitConverter.ToUInt32(Read(hero+0xbc,4),0),"team",side==1?"blue":"red","level",level,"health",hp,"maxHealth",maxHp,"resource",resource,"maxResource",maxResource,
                        "experienceTotal",Range(hero+0x4bb8,0,1000000),"currentGold",Range(hero+0x2848,0,1000000),"totalGold",Range(hero+0x2870,0,1000000),"spells",spells);
                    // A broken optional list must not discard valid health and cooldown samples.
                    try {player["buffs"]=Buffs(hero,time);} catch { }
                    players.Add(player);
                }
                var result=Obj("ok",true,"profile","cn-16.20.824.8524","pid",attachedPid,"processSession",attachedStart.ToUniversalTime().Ticks.ToString(),"gameTime",time,"sampledAt",DateTime.UtcNow.ToString("o"),"players",players);
                try {result["neutralObjectives"]=NeutralObjectives(list,time);} catch { }
                return result;
            }
        } catch(InvalidDataException e) {return Obj("ok",false,"reason",e.Message);}
          catch {Dispose();return Obj("ok",false,"reason","read-unavailable");}
    }
}
