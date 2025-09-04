(function(){
  const root = document.getElementById('ar-assessment');
  root.innerHTML = `
    <div class="bar card">
      <div class="pill">Not signed in</div>
      <h2 style="margin:10px 0 0 0">Module: ${MODULE.title}</h2>
      <div class="help">Brand styling & left orange bar are in place. We will add the full quiz/UI next.</div>
    </div>
    <div class="card">
      <button class="btn btn-orange">Submit answers</button>
      <button class="btn btn-neutral">Reset</button>
      <button class="btn btn-blue" disabled>Download results (PDF)</button>
      <button class="btn btn-green" disabled>Download certificate (PDF)</button>
      <button class="btn btn-neutral" disabled>Save to my account</button>
      <div class="help">Controls are placeholders for now.</div>
    </div>
    <div id="ar-toast"></div>
  `;
})();
