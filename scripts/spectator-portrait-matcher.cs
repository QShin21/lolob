using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public sealed class RiftCastPortraitTemplate {
  public string Team, ChampionId;
  public Bitmap Image;
}
public sealed class RiftCastScoreboardAnchor {
  public string Team;
  public double Y, Height;
}
public sealed class RiftCastPortraitMatch {
  public string Team, ChampionId, Method;
  public double X, Y, Width, Height, Score, Margin;
}
public sealed class RiftCastNumericWord {public string Text;public double X,Y,Width,Height,Score;public int GlyphCount;}
public static class RiftCastPortraitMatcher {
  const int Grid=12;
  sealed class Sample {public string Team,ChampionId;public double[] Pixels;}
  sealed class Candidate {public string ChampionId;public double Score=-1;public int X,Y,Size;}
  // A worker reuses reference samples and box geometry; every new frame still classifies all same-side heroes.
  static RiftCastPortraitTemplate[] cachedTemplates;
  static List<Sample> cachedSamples,cachedMaskedSamples;
  static List<RiftCastPortraitMatch> cachedBoxes=new List<RiftCastPortraitMatch>();
  static int cachedWidth,cachedHeight;
  static double cachedMiddle;
  public static void ResetLayout(){cachedBoxes.Clear();}
  sealed class Source {
    public int Width,Height,Stride;public byte[] Bytes;
    public Source(Bitmap source) {
      using(Bitmap copy=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppArgb)) {
        using(Graphics graphics=Graphics.FromImage(copy))graphics.DrawImage(source,new Rectangle(0,0,copy.Width,copy.Height),0,0,source.Width,source.Height,GraphicsUnit.Pixel);
        BitmapData data=copy.LockBits(new Rectangle(0,0,copy.Width,copy.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
        try{Width=copy.Width;Height=copy.Height;Stride=data.Stride;Bytes=new byte[Stride*Height];Marshal.Copy(data.Scan0,Bytes,0,Bytes.Length);}finally{copy.UnlockBits(data);}
      }
    }
  }
  static double[] Pixels(Source image,double x,double y,double size,bool maskedGray=false) {
    double[] values=new double[Grid*Grid*3];int index=0;
    for(int row=0;row<Grid;row++)for(int col=0;col<Grid;col++) {
      if(maskedGray&&row>=3&&row<11&&col>=1&&col<11){index+=3;continue;}
      double px=x+(col+.5)*size/Grid-.5,py=y+(row+.5)*size/Grid-.5;
      int left=Math.Max(0,Math.Min(image.Width-1,(int)Math.Floor(px))),top=Math.Max(0,Math.Min(image.Height-1,(int)Math.Floor(py)));
      int right=Math.Min(image.Width-1,left+1),bottom=Math.Min(image.Height-1,top+1);
      double fx=px-Math.Floor(px),fy=py-Math.Floor(py);
      int a=top*image.Stride+left*4,b=top*image.Stride+right*4,c=bottom*image.Stride+left*4,d=bottom*image.Stride+right*4;
      for(int channel=2;channel>=0;channel--)values[index++]=(image.Bytes[a+channel]*(1-fx)+image.Bytes[b+channel]*fx)*(1-fy)+(image.Bytes[c+channel]*(1-fx)+image.Bytes[d+channel]*fx)*fy;
      if(maskedGray){double gray=(values[index-3]+values[index-2]+values[index-1])/3;values[index-3]=gray;values[index-2]=gray;values[index-1]=gray;}
    }
    double mean=0,norm=0;int count=0;
    for(int i=0;i<values.Length;i++){int row=i/3/Grid,col=i/3%Grid;if(maskedGray&&row>=3&&row<11&&col>=1&&col<11)continue;mean+=values[i];count++;}mean/=count;
    for(int i=0;i<values.Length;i++){int row=i/3/Grid,col=i/3%Grid;if(maskedGray&&row>=3&&row<11&&col>=1&&col<11)continue;values[i]-=mean;norm+=values[i]*values[i];}
    norm=Math.Sqrt(norm);if(norm<200)return null;
    for(int i=0;i<values.Length;i++)values[i]/=norm;
    return values;
  }
  static double Score(double[] first,double[] second) {double value=0;for(int i=0;i<first.Length;i++)value+=first[i]*second[i];return value;}
  sealed class Glyph {public int X,Y,Width,Height;public bool[] Shape;}
  static List<Glyph> Glyphs(Bitmap image,int x,int y,int width,int height,bool yellowOnly) {
    x=Math.Max(0,x);y=Math.Max(0,y);width=Math.Min(width,image.Width-x);height=Math.Min(height,image.Height-y);
    bool[,] pixels=new bool[width,height];bool[] occupied=new bool[width];
    for(int col=0;col<width;col++)for(int row=0;row<height;row++) {
      Color value=image.GetPixel(x+col,y+row);bool active=value.R>145&&value.G>145&&(yellowOnly?value.B<Math.Min(value.R,value.G)*.88:value.B>=Math.Min(value.R,value.G)*.92);
      pixels[col,row]=active;if(active)occupied[col]=true;
    }
    List<Glyph> result=new List<Glyph>();
    for(int col=0;col<width;col++)if(occupied[col]) {
      int left=col,right=col;while(right+1<width&&occupied[right+1])right++;col=right;
      int top=height,bottom=0;for(int xx=left;xx<=right;xx++)for(int yy=0;yy<height;yy++)if(pixels[xx,yy]){top=Math.Min(top,yy);bottom=Math.Max(bottom,yy);}
      if(right-left<2||bottom-top<8)continue;
      bool[] shape=new bool[16*24];for(int yy=0;yy<24;yy++)for(int xx=0;xx<16;xx++)shape[yy*16+xx]=pixels[Math.Min(right,left+(int)((xx+.5)*(right-left+1)/16)),Math.Min(bottom,top+(int)((yy+.5)*(bottom-top+1)/24))];
      result.Add(new Glyph{X=x+left,Y=y+top,Width=right-left+1,Height=bottom-top+1,Shape=shape});
    }
    return result;
  }
  static double GlyphScore(bool[] first,bool[] second) {
    int together=0,count=0;for(int i=0;i<first.Length;i++){if(first[i])count++;if(second[i])count++;if(first[i]&&second[i])together++;}return count>0?2.0*together/count:0;
  }
  public static RiftCastNumericWord[] FindCsCells(Bitmap image,RiftCastPortraitMatch[] portraits){
    List<RiftCastNumericWord> result=new List<RiftCastNumericWord>();
    foreach(RiftCastPortraitMatch portrait in portraits){
      int left=(int)(portrait.Team=="blue"?portrait.X-portrait.Width*1.6:portrait.X+portrait.Width*1.35);
      List<Glyph> glyphs=Glyphs(image,left,(int)(portrait.Y+portrait.Height*.07),(int)(portrait.Width*1.3),(int)(portrait.Height*.86),true);
      if(glyphs.Count<1||glyphs.Count>4)continue;Glyph first=glyphs[0],last=glyphs[glyphs.Count-1];int minY=image.Height,maxY=0;
      foreach(Glyph glyph in glyphs){minY=Math.Min(minY,glyph.Y);maxY=Math.Max(maxY,glyph.Y+glyph.Height);}
      result.Add(new RiftCastNumericWord{X=first.X,Y=minY,Width=last.X+last.Width-first.X,Height=maxY-minY,GlyphCount=glyphs.Count});
    }
    return result.ToArray();
  }
  /** Only OCR-confirmed digits from this frame form templates; each CS glyph must have a unique strong match. */
  public static RiftCastNumericWord[] ReadCs(Bitmap image,RiftCastNumericWord[] words,RiftCastPortraitMatch[] portraits) {
    List<bool[]>[] templates=new List<bool[]>[10];for(int digit=0;digit<10;digit++)templates[digit]=new List<bool[]>();
    foreach(RiftCastNumericWord word in words) {
      string characters=word.Text.Replace(" ","");if(characters.Length<1||characters.Length>18)continue;
      bool numeric=true;foreach(char c in characters)if((c<'0'||c>'9')&&c!='/'&&c!='('&&c!=')')numeric=false;if(!numeric)continue;
      List<Glyph> glyphs=Glyphs(image,(int)Math.Floor(word.X)-1,(int)Math.Floor(word.Y)-1,(int)Math.Ceiling(word.Width)+3,(int)Math.Ceiling(word.Height)+3,false);
      if(glyphs.Count!=characters.Length)continue;
      for(int digit=0;digit<glyphs.Count;digit++)if(characters[digit]>='0'&&characters[digit]<='9'&&glyphs[digit].Height>=word.Height*.7)templates[characters[digit]-'0'].Add(glyphs[digit].Shape);
    }
    // Missing white digits may be supplied by two independently OCR-confirmed CS cells
    // in this frame. Reject shapes that contradict a known white digit before using them.
    List<bool[]>[] yellow=new List<bool[]>[10];for(int digit=0;digit<10;digit++)yellow[digit]=new List<bool[]>();
    foreach(RiftCastNumericWord word in words){
      if(word.Text.Length<1||word.Text.Length>4)continue;bool numeric=true;foreach(char c in word.Text)if(c<'0'||c>'9')numeric=false;if(!numeric)continue;
      bool inCs=false;foreach(RiftCastPortraitMatch portrait in portraits){double center=word.Y+word.Height/2;if(Math.Abs(center-portrait.Y-portrait.Height/2)>portrait.Height*.35)continue;
        if(portrait.Team=="blue"?word.X+word.Width<=portrait.X&&word.X>=portrait.X-portrait.Width*1.6:word.X>=portrait.X+portrait.Width&&word.X+word.Width<=portrait.X+portrait.Width*2.65)inCs=true;}
      if(!inCs)continue;
      List<Glyph> glyphs=Glyphs(image,(int)Math.Floor(word.X)-1,(int)Math.Floor(word.Y)-1,(int)Math.Ceiling(word.Width)+3,(int)Math.Ceiling(word.Height)+3,true);
      if(glyphs.Count!=word.Text.Length)continue;
      for(int position=0;position<glyphs.Count;position++){int label=word.Text[position]-'0';bool conflict=false;
        for(int digit=0;digit<10;digit++)if(digit!=label)foreach(bool[] known in templates[digit])if(GlyphScore(glyphs[position].Shape,known)>=.89)conflict=true;
        if(!conflict)yellow[label].Add(glyphs[position].Shape);
      }
    }
    for(int digit=0;digit<10;digit++)for(int first=0;first<yellow[digit].Count;first++)for(int second=first+1;second<yellow[digit].Count;second++)if(GlyphScore(yellow[digit][first],yellow[digit][second])>=.96){templates[digit].Add(yellow[digit][first]);templates[digit].Add(yellow[digit][second]);}
    List<RiftCastNumericWord> result=new List<RiftCastNumericWord>();
    foreach(RiftCastPortraitMatch portrait in portraits) {
      int left=(int)(portrait.Team=="blue"?portrait.X-portrait.Width*1.6:portrait.X+portrait.Width*1.35);
      int top=(int)(portrait.Y+portrait.Height*.07),width=(int)(portrait.Width*1.3),height=(int)(portrait.Height*.86);
      List<Glyph> glyphs=Glyphs(image,left,top,width,height,true);if(glyphs.Count<1||glyphs.Count>4)continue;
      string text="";double confidence=1;bool valid=true;
      foreach(Glyph glyph in glyphs) {
        int winner=-1;double best=0,second=0;
        for(int digit=0;digit<10;digit++) {double score=0;foreach(bool[] reference in templates[digit])score=Math.Max(score,GlyphScore(glyph.Shape,reference));if(score>best){second=best;best=score;winner=digit;}else second=Math.Max(second,score);}
        if(winner<0||best<.89||best-second<.055){valid=false;break;}
        text+=(char)('0'+winner);confidence=Math.Min(confidence,best);
      }
      if(!valid)continue;Glyph first=glyphs[0],last=glyphs[glyphs.Count-1];int minY=image.Height,maxY=0;foreach(Glyph glyph in glyphs){minY=Math.Min(minY,glyph.Y);maxY=Math.Max(maxY,glyph.Y+glyph.Height);}
      result.Add(new RiftCastNumericWord{Text=text,X=first.X,Y=minY,Width=last.X+last.Width-first.X,Height=maxY-minY,Score=confidence});
    }
    return result.ToArray();
  }
  public static RiftCastPortraitMatch[] Find(Bitmap image,RiftCastPortraitTemplate[] templates,RiftCastScoreboardAnchor[] anchors,double middle) {
    Source source=new Source(image);
    bool reuse=cachedTemplates!=null&&cachedTemplates.Length==templates.Length;
    if(reuse)for(int i=0;i<templates.Length;i++)if(!Object.ReferenceEquals(cachedTemplates[i],templates[i])){reuse=false;break;}
    if(!reuse){
    cachedTemplates=(RiftCastPortraitTemplate[])templates.Clone();cachedSamples=new List<Sample>();cachedMaskedSamples=new List<Sample>();cachedBoxes.Clear();
    foreach(RiftCastPortraitTemplate template in templates) {Source reference=new Source(template.Image);foreach(double border in new double[]{0,.033,.067}) {
      double[] pixels=Pixels(reference,template.Image.Width*border,template.Image.Height*border,template.Image.Width*(1-2*border));
      if(pixels!=null)cachedSamples.Add(new Sample{Team=template.Team,ChampionId=template.ChampionId,Pixels=pixels});
      double[] masked=Pixels(reference,template.Image.Width*border,template.Image.Height*border,template.Image.Width*(1-2*border),true);
      if(masked!=null)cachedMaskedSamples.Add(new Sample{Team=template.Team,ChampionId=template.ChampionId,Pixels=masked});
    }}
    }
    if(cachedWidth!=image.Width||cachedHeight!=image.Height||Math.Abs(cachedMiddle-middle)>.01)cachedBoxes.Clear();
    cachedWidth=image.Width;cachedHeight=image.Height;cachedMiddle=middle;
    List<RiftCastPortraitMatch> results=new List<RiftCastPortraitMatch>();
    foreach(RiftCastScoreboardAnchor anchor in anchors) {
      RiftCastPortraitMatch hint=null;
      foreach(RiftCastPortraitMatch box in cachedBoxes)if(box.Team==anchor.Team&&Math.Abs(box.Y+box.Height/2-anchor.Y)<anchor.Height*.8){hint=box;break;}
      for(int pass=0;pass<2;pass++){
      List<Sample> active=pass==0?cachedSamples:cachedMaskedSamples;
      Dictionary<string,Candidate> scores=new Dictionary<string,Candidate>();
      int minSize=Math.Max(18,(int)(anchor.Height*1.55)),maxSize=Math.Min(160,(int)(anchor.Height*2.8));
      int step=Math.Max(2,(int)(anchor.Height/7));
      int startX=(int)Math.Max(0,anchor.Team=="blue"?middle-anchor.Height*4.8:middle);
      int endX=(int)Math.Min(image.Width,anchor.Team=="blue"?middle:middle+anchor.Height*4.8);
      // Cached coordinates contain geometry only. A changed or obscured hero is never accepted by its previous identity.
      if(hint!=null){minSize=Math.Max(18,(int)hint.Width-2);maxSize=(int)hint.Width+2;step=1;startX=Math.Max(0,(int)hint.X-2);endX=Math.Min(image.Width,(int)(hint.X+hint.Width)+4);}
      for(int size=minSize;size<=maxSize;size+=step)for(int y=(int)(hint!=null?hint.Y-2:anchor.Y-size/2.0-anchor.Height*.48);y<=(hint!=null?hint.Y+2:anchor.Y-size/2.0+anchor.Height*.55);y+=step)for(int x=startX;x+size<=endX;x+=step) {
        if(y<0||y+size>image.Height)continue;double[] pixels=Pixels(source,x,y,size,pass==1);if(pixels==null)continue;
        foreach(Sample sample in active) {
          if(sample.Team!=anchor.Team)continue;Candidate candidate;if(!scores.TryGetValue(sample.ChampionId,out candidate)){candidate=new Candidate{ChampionId=sample.ChampionId};scores.Add(sample.ChampionId,candidate);}
          double score=Score(pixels,sample.Pixels);if(score>candidate.Score){candidate.Score=score;candidate.X=x;candidate.Y=y;candidate.Size=size;}
        }
      }
      List<Candidate> ordered=new List<Candidate>(scores.Values);ordered.Sort((a,b)=>b.Score.CompareTo(a.Score));
      if(ordered.Count==0)continue;
      if(hint==null)foreach(Candidate candidate in ordered){int bx=candidate.X,by=candidate.Y,bs=candidate.Size;
      for(int size=Math.Max(minSize,bs-step);size<=Math.Min(maxSize,bs+step);size++)for(int y=by-step;y<=by+step;y++)for(int x=bx-step;x<=bx+step;x++) {
        if(x<startX||x+size>endX||y<0||y+size>image.Height)continue;double[] pixels=Pixels(source,x,y,size,pass==1);if(pixels==null)continue;
        foreach(Sample sample in active)if(sample.Team==anchor.Team&&sample.ChampionId==candidate.ChampionId){double score=Score(pixels,sample.Pixels);if(score>candidate.Score){candidate.Score=score;candidate.X=x;candidate.Y=y;candidate.Size=size;}}
      }
      }
      ordered.Sort((a,b)=>b.Score.CompareTo(a.Score));Candidate best=ordered[0];
      double runner=ordered.Count>1?ordered[1].Score:0,margin=best.Score-runner;
      // The identity requires both an absolute portrait match and separation from other current champions.
      if(best.Score<(pass==0?.90:.94)||margin<(pass==0?.09:.12))continue;
      results.Add(new RiftCastPortraitMatch{Team=anchor.Team,ChampionId=best.ChampionId,Method=pass==0?"full":"outer-gray",X=best.X,Y=best.Y,Width=best.Size,Height=best.Size,Score=best.Score,Margin=margin});
      break;
      }
    }
    foreach(RiftCastPortraitMatch found in results){cachedBoxes.RemoveAll(box=>box.Team==found.Team&&Math.Abs(box.Y+box.Height/2-found.Y-found.Height/2)<found.Height*.5);cachedBoxes.Add(found);}
    return results.ToArray();
  }
}
