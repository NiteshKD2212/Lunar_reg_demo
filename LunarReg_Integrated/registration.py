import cv2, numpy as np
from pathlib import Path
from skimage.metrics import structural_similarity

def load(path):
    x=cv2.imread(str(path),cv2.IMREAD_UNCHANGED)
    if x is None: raise ValueError("Could not read image.")
    if x.ndim==3: x=cv2.cvtColor(x,cv2.COLOR_BGR2GRAY)
    if x.dtype!=np.uint8:
        lo,hi=np.percentile(x,[1,99])
        x=np.clip((x-lo)*255/max(hi-lo,1),0,255).astype(np.uint8)
    return x

def nmi(a,b,bins=64):
    h,_,_=np.histogram2d(a.ravel(),b.ravel(),bins=bins,range=[[0,255],[0,255]])
    p=h/(h.sum()+1e-12); pa=p.sum(1); pb=p.sum(0)
    den=pa[:,None]*pb[None,:]; nz=p>0
    mi=np.sum(p[nz]*np.log((p[nz]+1e-12)/(den[nz]+1e-12)))
    ha=-np.sum(pa[pa>0]*np.log(pa[pa>0])); hb=-np.sum(pb[pb>0]*np.log(pb[pb>0]))
    return float(2*mi/(ha+hb+1e-12))

def edge_overlap(a,b):
    ea=cv2.Canny(a,50,150)>0; eb=cv2.Canny(b,50,150)>0
    da=cv2.distanceTransform((~ea).astype(np.uint8),cv2.DIST_L2,3)
    db=cv2.distanceTransform((~eb).astype(np.uint8),cv2.DIST_L2,3)
    if not ea.any() or not eb.any(): return 0
    return float((np.mean(db[ea]<=2)+np.mean(da[eb]<=2))/2*100)

def coverage(points,shape):
    h,w=shape; grid=np.zeros((5,5),bool)
    for x,y in points:
        c=min(4,int(x/w*5)); r=min(4,int(y/h*5)); grid[r,c]=1
    return float(grid.mean()*100)

def register(sp,rp,out,job):
    try: src,ref=load(sp),load(rp)
    except Exception as e: return {"success":False,"message":str(e)}
    sift=cv2.SIFT_create(nfeatures=12000,contrastThreshold=.01)
    k1,d1=sift.detectAndCompute(src,None); k2,d2=sift.detectAndCompute(ref,None)
    if d1 is None or d2 is None: return {"success":False,"message":"Not enough detectable features."}
    knn=cv2.BFMatcher(cv2.NORM_L2).knnMatch(d1,d2,k=2)
    good=[m for m,n in knn if m.distance<.72*n.distance]
    if len(good)<8: return {"success":False,"message":f"Only {len(good)} candidate matches found."}
    p1=np.float32([k1[m.queryIdx].pt for m in good]).reshape(-1,1,2)
    p2=np.float32([k2[m.trainIdx].pt for m in good]).reshape(-1,1,2)
    H,mask=cv2.findHomography(p1,p2,cv2.USAC_MAGSAC,3.0,confidence=.999)
    if H is None: return {"success":False,"message":"Could not estimate a stable transformation."}
    mask=mask.ravel().astype(bool)
    a=p1.reshape(-1,2)[mask].astype(np.float32).reshape(-1,1,2)
    b=p2.reshape(-1,2)[mask].astype(np.float32).reshape(-1,1,2)
    # Sub-pixel corner refinement, followed by a second robust fit.
    try:
        criteria=(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,50,.001)
        a=cv2.cornerSubPix(src,a,(5,5),(-1,-1),criteria)
        b=cv2.cornerSubPix(ref,b,(5,5),(-1,-1),criteria)
        H2,_=cv2.findHomography(a,b,cv2.USAC_MAGSAC,2.0,confidence=.999)
        if H2 is not None: H=H2
    except cv2.error: pass
    pred=cv2.perspectiveTransform(a,H).reshape(-1,2); actual=b.reshape(-1,2)
    err=np.linalg.norm(pred-actual,axis=1)
    rmse=float(np.sqrt(np.mean(err**2))); med=float(np.median(err))
    h,w=ref.shape; reg=cv2.warpPerspective(src,H,(w,h),flags=cv2.INTER_LANCZOS4)
    rn=cv2.normalize(reg,None,0,255,cv2.NORM_MINMAX).astype(np.uint8)
    rr=cv2.normalize(ref,None,0,255,cv2.NORM_MINMAX).astype(np.uint8)
    ncc=float(np.corrcoef(rr.ravel().astype(float),rn.ravel().astype(float))[0,1])
    ssim=float(structural_similarity(rr,rn,data_range=255))
    mvis=cv2.drawMatches(src,k1,ref,k2,[m for i,m in enumerate(good) if mask[i]],None,
                         flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
    overlay=cv2.addWeighted(rr,.5,rn,.5,0)
    # Inlier locations (normalised to the reference frame) + per-point error, for the UI plots.
    idx=np.linspace(0,len(actual)-1,min(len(actual),400)).astype(int)
    pts=[[round(float(actual[i,0]/w),4),round(float(actual[i,1]/h),4),round(float(err[i]),4)] for i in idx]
    names=[f"{job}_matches.png",f"{job}_registered.png",f"{job}_overlay.png"]
    cv2.imwrite(str(out/names[0]),mvis); cv2.imwrite(str(out/names[1]),reg); cv2.imwrite(str(out/names[2]),overlay)
    return {"success":True,"metrics":{
        "Candidate matches":len(good),"Inliers":int(mask.sum()),
        "Inlier ratio (%)":round(mask.mean()*100,2),"RMSE (px)":round(rmse,4),
        "Median error (px)":round(med,4),"Max error (px)":round(float(err.max()),4),"NMI":round(nmi(rr,rn),4),
        "NCC":round(ncc,4),"SSIM":round(ssim,4),
        "Edge overlap (%)":round(edge_overlap(rr,rn),2),
        "Match coverage (%)":round(coverage(actual,(h,w)),2)},
        "points":pts,
        "matches":f"/file/{names[0]}","registered":f"/file/{names[1]}","overlay":f"/file/{names[2]}"}
