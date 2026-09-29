// Configurações do Supabase
var SUPABASE_URL = "https://neyplzldyvtyupgljict.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5leXBsemxkeXZ0eXVwZ2xqaWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MDI2NDQsImV4cCI6MjEwNTA3ODY0NH0.5OYss0v6DWPGTHtS24I1cWlb_dLdgGSPQmjj9t04P5c";

var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

var map = null;
var loteLayer = L.layerGroup(); 
var verticesLayer = L.layerGroup(); 
var lpmLayer = L.layerGroup();
var ltmLayer = L.layerGroup();
var marinhaUnidaLayer = L.layerGroup(); 
var interseccaoLayer = L.layerGroup(); 
var loteSelecionado = null;
var verticesSelecionados = [];

window.onload = () => {
  map = L.map('map').setView([-7.115, -34.863], 13);
  
  L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Maps Satélite'
  }).addTo(map);

  loteLayer.addTo(map);
  verticesLayer.addTo(map);
  lpmLayer.addTo(map);
  ltmLayer.addTo(map);
  marinhaUnidaLayer.addTo(map); 
  interseccaoLayer.addTo(map); 

  var overlayMaps = {
    "Lote Pesquisado (Azul)": loteLayer,
    "LPM (Praiamar Média)": lpmLayer,
    "LTM (Terrenos de Marinha)": ltmLayer,
    "Área Calculada (Roxa)": interseccaoLayer
  };
  L.control.layers(null, overlayMaps, { collapsed: false }).addTo(map);

  // NOVIDADE: Garante que a Área Roxa volta para o topo se o Lote Azul for reativado
  map.on('overlayadd', function(e) {
    if (e.name === 'Lote Pesquisado (Azul)' && map.hasLayer(interseccaoLayer)) {
      interseccaoLayer.eachLayer(function (layer) {
        if (layer.bringToFront) layer.bringToFront();
      });
    }
  });

  console.log("🚀 VERSÃO 29: Ordem Visual de Camadas Totalmente Corrigida");

  const inputBusca = document.getElementById('input-busca');
  if (inputBusca) {
    inputBusca.placeholder = "Digite o Codi_Lote ou Código Cartográfico";
    inputBusca.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') buscarPorTermo();
    });
  }

  carregarCamadasMarinha();
};

async function buscarPorTermo() {
  const inputBusca = document.getElementById('input-busca');
  if (!inputBusca) return;
  
  const termo = inputBusca.value.trim();
  if (!termo) {
    alert("Digite um código de lote para pesquisar.");
    return;
  }
  
  try {
    const { data, error } = await supabaseClient.rpc('buscar_lote_exato', {
      p_codigo: termo
    });

    if (error) {
       console.error("Erro do Supabase:", error.message);
       alert("Ocorreu um erro ao comunicar com a base de dados.");
       return;
    }

    if (!data || data.length === 0) {
      alert(`Nenhum lote localizado com o código: "${termo}".`);
      limparCampos();
      return;
    }

    const row = data[0];
    
    let areaCalculada = 0;
    let geojsonInterseccao = null;
    
    try {
      const resUniao = await supabaseClient.rpc('calcular_area_uniao_lote', { p_codigo: termo });
      if (resUniao.data !== null && !isNaN(resUniao.data)) {
        areaCalculada = parseFloat(resUniao.data);
        
        if (areaCalculada > 0) {
            const resGeom = await supabaseClient.rpc('obter_geojson_uniao_lote', { p_codigo: termo });
            if (resGeom.data) {
                geojsonInterseccao = JSON.parse(resGeom.data);
            }
        }
      }
    } catch (e) {
      console.warn("Aviso ao processar área da União:", e);
    }
    
    const lote = {
      Codi_Lote: row.codi_lote || 'N/A',
      Desc_Logr: row.desc_logr || 'Desconhecido',
      area_m2: row.area_m2 || 0,
      area_uniao_m2: areaCalculada, 
      geom_wgs84: row.geom_wgs84,   
      geom_sirgas: row.geom_sirgas,
      geom_interseccao: geojsonInterseccao
    };

    desenharLoteNaTela(lote);

  } catch (err) {
    console.error("Erro na pesquisa:", err);
  }
}

async function carregarCamadasMarinha() {
  try {
    const resLpm = await supabaseClient.rpc('buscar_lpm');
    if (resLpm.data && Array.isArray(resLpm.data)) {
      resLpm.data.forEach(item => {
        if (item.geom_wgs84) {
          L.geoJSON(item.geom_wgs84, {
            style: { color: '#ef4444', weight: 3, opacity: 1 }
          })
          .bindTooltip("<b>LPM</b><br>Linha do Preamar Médio", { sticky: true })
          .addTo(lpmLayer);
        }
      });
    }

    const resLtm = await supabaseClient.rpc('buscar_ltm');
    if (resLtm.data && Array.isArray(resLtm.data)) {
      resLtm.data.forEach(item => {
        if (item.geom_wgs84) {
          L.geoJSON(item.geom_wgs84, {
            style: { color: '#facc15', weight: 3, opacity: 1 }
          })
          .bindTooltip("<b>LTM</b><br>Linha de Terrenos de Marinha", { sticky: true })
          .addTo(ltmLayer);
        }
      });
    }

    const resUnido = await supabaseClient.rpc('get_poligono_marinha_geojson');
    if (resUnido.data) {
      L.geoJSON(resUnido.data, {
        style: { color: 'transparent', weight: 0, fillColor: 'transparent', fillOpacity: 0 }
      }).addTo(marinhaUnidaLayer);
    }

  } catch (err) {
    console.error("Erro ao carregar camadas de marinha:", err);
  }
}

function calcularAzimute(deltaX, deltaY) {
  if (isNaN(deltaX) || isNaN(deltaY)) return "0° 0' 0\"";
  let azimuteRad = Math.atan2(deltaX, deltaY);
  let azimuteDeg = azimuteRad * (180 / Math.PI);
  if (azimuteDeg < 0) azimuteDeg += 360;
  
  const d = Math.floor(azimuteDeg);
  const minFloat = (azimuteDeg - d) * 60;
  const m = Math.floor(minFloat);
  const s = Math.round((minFloat - m) * 60);
  
  return `${d}° ${m}' ${s}"`;
}

function desenharLoteNaTela(lote) {
  loteSelecionado = lote;

  const campoProprietario = document.getElementById('txt-proprietario');
  if (campoProprietario) campoProprietario.innerText = lote.Desc_Logr || 'Endereço não informado';
  document.getElementById('txt-rip').innerText = lote.Codi_Lote || 'N/A';
  
  const temAreaUniao = lote.area_uniao_m2 && lote.area_uniao_m2 > 0;
  
  const areaHTML = `
    <span style="display: block;">Total: ${lote.area_m2 || 0} m²</span>
    ${temAreaUniao ? 
      `<span style="display: block; color: #7e22ce; font-weight: bold; margin-top: 4px;">União: ${lote.area_uniao_m2} m²</span>` 
      : `<span style="display: block; color: #64748b; font-size: 0.85rem; margin-top: 4px; font-style: italic;">Este lote não possui área da União</span>`}
  `;
  document.getElementById('txt-area').innerHTML = areaHTML;

  loteLayer.clearLayers();
  verticesLayer.clearLayers();
  interseccaoLayer.clearLayers();
  verticesSelecionados = [];

  const tbody = document.getElementById('tbody-vertices');
  if (tbody) tbody.innerHTML = '';

  if (lote.geom_wgs84 && lote.geom_sirgas) {
    
    const loteGeo = L.geoJSON(lote.geom_wgs84, {
      style: { color: '#2563eb', weight: 4, fillColor: '#3b82f6', fillOpacity: 0.5 }
    }).bindTooltip("<b>Lote (Área Total)</b><br>Limites do imóvel", { sticky: true });
    
    loteLayer.addLayer(loteGeo);
    map.fitBounds(loteGeo.getBounds(), { padding: [50, 50], maxZoom: 19 });

    if (lote.geom_interseccao) {
      L.geoJSON(lote.geom_interseccao, {
        style: { color: '#7e22ce', weight: 3, fillColor: '#a855f7', fillOpacity: 0.75 }
      })
      .bindTooltip("<b>Área da União</b><br>Intersecção com Terreno de Marinha", { sticky: true })
      .addTo(interseccaoLayer);
      
      interseccaoLayer.eachLayer(function (layer) {
          if (layer.bringToFront) layer.bringToFront();
      });
    }

    const geomType = lote.geom_sirgas.type;
    let pointIndex = 1;

    const processarAnel = (anelSirgas, anelWgs84) => {
      for (let i = 0; i < anelSirgas.length - 1; i++) {
        const ptSirgasAtual = anelSirgas[i];       
        const ptSirgasProximo = anelSirgas[i + 1]; 
        const ptWgs84Atual = anelWgs84[i];         

        const latlngAtual = [ptWgs84Atual[1], ptWgs84Atual[0]];
        
        // NOVIDADE: A propriedade "pane: 'markerPane'" força os pontos para o plano z-index mais alto
        const marcador = L.circleMarker(latlngAtual, {
          pane: 'markerPane', 
          radius: 5, 
          fillColor: "#ffffff", 
          color: "#1e293b", 
          weight: 2, 
          fillOpacity: 1
        });
        
        marcador.bindTooltip(`<span style="font-size: 10px; font-weight: bold; color: #1e293b;">P${pointIndex}</span>`, { direction: 'top', offset: [0, -3] }).addTo(verticesLayer);

        const esteX = ptSirgasAtual[0].toFixed(2);
        const norteY = ptSirgasAtual[1].toFixed(2);
        const deltaX = ptSirgasProximo[0] - ptSirgasAtual[0];
        const deltaY = ptSirgasProximo[1] - ptSirgasAtual[1];
        const distanciaMts = Math.sqrt(deltaX * deltaX + deltaY * deltaY).toFixed(2);
        const azimuteStr = calcularAzimute(deltaX, deltaY);

        const vObj = {
          vertice_id: pointIndex,
          este_x: esteX,
          norte_y: norteY,
          distancia_m: distanciaMts,
          azimute_graus: azimuteStr
        };
        verticesSelecionados.push(vObj);

        if (tbody) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>P${vObj.vertice_id}</td>
            <td>${vObj.este_x}</td>
            <td>${vObj.norte_y}</td>
            <td>${vObj.distancia_m}</td>
            <td>${vObj.azimute_graus}</td>
          `;
          tbody.appendChild(tr);
        }
        pointIndex++;
      }
    };

    if (geomType === 'Polygon') {
      processarAnel(lote.geom_sirgas.coordinates[0], lote.geom_wgs84.coordinates[0]);
    } else if (geomType === 'MultiPolygon') {
      for (let p = 0; p < lote.geom_sirgas.coordinates.length; p++) {
        processarAnel(lote.geom_sirgas.coordinates[p][0], lote.geom_wgs84.coordinates[p][0]);
      }
    }
  }

  const btnExportar = document.getElementById('btn-exportar');
  if (btnExportar) btnExportar.disabled = false;
}

function limparCampos() {
  const campoProprietario = document.getElementById('txt-proprietario');
  if (campoProprietario) campoProprietario.innerText = '-';
  document.getElementById('txt-rip').innerText = '-';
  document.getElementById('txt-area').innerText = '0 m²';
  
  const tbody = document.getElementById('tbody-vertices');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="has-text-centered has-text-grey py-4">Nenhum lote selecionado.</td></tr>';
  
  loteLayer.clearLayers();
  verticesLayer.clearLayers();
  interseccaoLayer.clearLayers();
  
  loteSelecionado = null;
  verticesSelecionados = [];
}

async function gerarMemorialDocx() {
  if (!loteSelecionado || verticesSelecionados.length === 0) return;

  const enderecoFinal = loteSelecionado.Desc_Logr !== 'Desconhecido' && loteSelecionado.Desc_Logr !== '-' ? loteSelecionado.Desc_Logr : 'Endereço não informado';

  const proprietarioManual = prompt("Digite o nome do Proprietário do imóvel para o Memorial:", "União Federal");
  if (proprietarioManual === null) return; 
  const proprietarioFinal = proprietarioManual.trim() || "União Federal";

  const { docx } = window;

  let perimetro = 0;
  verticesSelecionados.forEach(v => {
    perimetro += parseFloat(v.distancia_m || 0);
  });
  
  const perimetroStr = perimetro.toFixed(2).replace('.', ',');
  const areaStr = (loteSelecionado.area_m2 || 0).toString().replace('.', ',');

  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dataHj = new Date();
  const dataStr = `${dataHj.getDate()} de ${meses[dataHj.getMonth()]} de ${dataHj.getFullYear()}`;

  let textoVertices = `Inicia-se a descrição deste perímetro no vértice P${verticesSelecionados[0].vertice_id}, de coordenadas N ${verticesSelecionados[0].norte_y.replace('.', ',')} m e E ${verticesSelecionados[0].este_x.replace('.', ',')} m; `;

  for (let i = 0; i < verticesSelecionados.length; i++) {
    let vAtual = verticesSelecionados[i];
    let vProx = verticesSelecionados[(i + 1) % verticesSelecionados.length];
    let dist = vAtual.distancia_m.replace('.', ',');
    let az = vAtual.azimute_graus.replace(/"/g, "''"); 

    textoVertices += `deste, segue com os seguintes azimute plano e distância: ${az} e ${dist} m; até o vértice P${vProx.vertice_id}, de coordenadas N ${vProx.norte_y.replace('.', ',')} m e E ${vProx.este_x.replace('.', ',')} m; `;
  }
  textoVertices = textoVertices.slice(0, -2) + ", encerrando esta descrição.";

  let imageBuffer = null;
  try {
    const response = await fetch('./brasao.png');
    if (response.ok) {
        imageBuffer = await response.arrayBuffer();
    }
  } catch (e) {
    console.warn("Imagem brasao.png não encontrada.");
  }

  const docChildren = [];

  if (imageBuffer) {
      docChildren.push(new docx.Paragraph({
          children: [
              new docx.ImageRun({
                  data: imageBuffer,
                  transformation: { width: 120, height: 120 }
              })
          ],
          alignment: docx.AlignmentType.CENTER,
          spacing: { after: 400 }
      }));
  }

  docChildren.push(
    new docx.Paragraph({ text: "Memorial Descritivo", alignment: docx.AlignmentType.CENTER, bold: true, spacing: { after: 400 } }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Imóvel: ", bold: true }), new docx.TextRun({ text: "Terreno da União" }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Proprietário: ", bold: true }), new docx.TextRun({ text: proprietarioFinal }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Endereço: ", bold: true }), new docx.TextRun({ text: enderecoFinal }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Município/UF: ", bold: true }), new docx.TextRun({ text: "João Pessoa/PB" }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Perímetro (m): ", bold: true }), new docx.TextRun({ text: perimetroStr }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Área (m²): ", bold: true }), new docx.TextRun({ text: areaStr }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "RIP: ", bold: true }), new docx.TextRun({ text: loteSelecionado.Codi_Lote || '-' }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "NBP: ", bold: true }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Matrícula: ", bold: true }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Comarca: ", bold: true }) ] }),
    new docx.Paragraph({ children: [ new docx.TextRun({ text: "Código INCRA: ", bold: true }) ], spacing: { after: 400 } }),
    new docx.Paragraph({ text: "DESCRIÇÃO", alignment: docx.AlignmentType.CENTER, bold: true, spacing: { after: 200 } }),
    new docx.Paragraph({
        children: [ new docx.TextRun({ text: `O imóvel descrito abaixo corresponde a um terreno de ${areaStr} m², localizado à ${enderecoFinal}, no município de João Pessoa/PB, representado na planta , processo SEI: .` }) ],
        alignment: docx.AlignmentType.JUSTIFIED,
        spacing: { after: 200 }
    }),
    new docx.Paragraph({
        children: [ new docx.TextRun({ text: textoVertices }) ],
        alignment: docx.AlignmentType.JUSTIFIED,
        spacing: { after: 400 }
    }),
    new docx.Paragraph({
        children: [ new docx.TextRun({ text: "Todas as coordenadas aqui descritas estão georreferenciadas ao Sistema Geodésico Brasileiro e encontram-se representadas no sistema UTM, referenciadas ao Meridiano Central -33, Fuso 25S, tendo como DATUM SIRGAS 2000. Todos os azimutes e distâncias, área e perímetro foram calculados no plano de projeção UTM." }) ],
        alignment: docx.AlignmentType.JUSTIFIED,
        spacing: { after: 800 }
    }),
    new docx.Paragraph({ text: `João Pessoa, ${dataStr}`, alignment: docx.AlignmentType.RIGHT, spacing: { after: 600 } }),
    new docx.Paragraph({ text: "______________________________________________________", alignment: docx.AlignmentType.CENTER }),
    new docx.Paragraph({ text: "Responsável Técnico", alignment: docx.AlignmentType.CENTER }),
    new docx.Paragraph({ text: "CREA: ", alignment: docx.AlignmentType.CENTER })
  );

  const doc = new docx.Document({
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: docChildren
    }]
  });

  docx.Packer.toBlob(doc).then(blob => {
    saveAs(blob, `Memorial_Descritivo_${loteSelecionado.Codi_Lote || 'Lote'}.docx`);
  });
}
