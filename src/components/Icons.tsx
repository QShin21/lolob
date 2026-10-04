export function Brand({compact=false}: {compact?:boolean}) {
  return <div className="brand"><div className="brand-icon" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M12 2 22 8v8l-10 6L2 16V8L12 2Z" stroke="currentColor" strokeWidth="1.6"/><path d="m7 8 5-3 5 3-5 3-5-3Zm0 4 5 3 5-3M12 11v8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg></div>{!compact&&<div><strong>RiftCast</strong><small>裂谷导播工作站</small></div>}</div>;
}
