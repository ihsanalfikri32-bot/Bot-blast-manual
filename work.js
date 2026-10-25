import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction, update, set } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

const firebaseConfig = {
    databaseURL: "https://web-blast-manual-default-rtdb.firebaseio.com/", 
};

// TOKEN DAN ID ADMIN ANDA
const TELEGRAM_BOT_TOKEN = "8482051630:AAEMjyVO4ufG181ztPo6ErROiYfylYu7oEA"; 
const ADMIN_CHAT_ID = "@Licianpoo"; 

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const setsRef = ref(db, 'sets');
const workersRef = ref(db, 'workers'); 

const tg = window.Telegram.WebApp;
tg.expand();
const tgUser = tg.initDataUnsafe?.user; 

let workerName = "";
let paymentData = "";
let isWorking = false;
let timerInterval;
let activeSetKey = null; 
let activeSetName = null; 

window.onload = () => {
    if (tgUser) {
        workerName = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
        document.getElementById('tg-name-display').innerText = workerName;
    } else {
        document.getElementById('fallback-name-container').classList.remove('hidden');
        document.getElementById('tg-name-display').innerText = "Tamu (Bukan Telegram)";
        workerName = localStorage.getItem('wa_worker_name') || "";
        document.getElementById('input-nama').value = workerName;
    }
    paymentData = localStorage.getItem('wa_payment_info') || "";
    document.getElementById('input-payment').value = paymentData;

    if (workerName && paymentData) {
        simpanDataPekerja(); 
        masukKeWorkspace();
    }
};

window.simpanDataPekerja = () => {
    if (!tgUser) {
        workerName = document.getElementById('input-nama').value.trim();
        if (!workerName) return alert("Identitas tidak boleh kosong.");
        localStorage.setItem('wa_worker_name', workerName);
    }
    paymentData = document.getElementById('input-payment').value.trim();
    if (!paymentData) return alert("Metode pencairan wajib diisi.");
    localStorage.setItem('wa_payment_info', paymentData);

    const safeKey = workerName.replace(/[.#$[\]]/g, ''); 
    set(ref(db, `workers/${safeKey}`), {
        nama_telegram: workerName,
        data_pembayaran: paymentData,
        login_terakhir: Date.now()
    });
    masukKeWorkspace();
};

window.editPembayaran = () => {
    localStorage.removeItem('wa_payment_info');
    location.reload(); 
};

function masukKeWorkspace() {
    document.getElementById('display-nama').innerText = workerName;
    document.getElementById('panel-login').classList.add('hidden');
    document.getElementById('panel-workspace').classList.remove('hidden');
    mulaiPantauSet();
}

function mulaiPantauSet() {
    onValue(setsRef, (snapshot) => {
        if (isWorking) return; 
        
        const gridSets = document.getElementById('grid-sets');
        const emptyState = document.getElementById('empty-state');
        const historyTbody = document.getElementById('worker-history-list');
        const historyEmpty = document.getElementById('history-empty');
        
        gridSets.innerHTML = ''; 
        historyTbody.innerHTML = '';
        
        let setTersediaCount = 0;
        let riwayatCount = 0;

        if (snapshot.exists()) {
            const setsData = snapshot.val();
            const allSets = Object.keys(setsData).map(key => ({ key, ...setsData[key] }));

            const availableSets = allSets.filter(set => set.status === "Tersedia").sort((a, b) => a.id - b.id);
            setTersediaCount = availableSets.length;

            // Desain Grid Modern
            availableSets.forEach(setInfo => {
                const btn = document.createElement('button');
                btn.className = "glass-btn bg-white/5 py-4 px-3 rounded-2xl flex flex-col items-start gap-1 group text-left";
                btn.innerHTML = `
                    <span class="text-xs opacity-50 uppercase tracking-wider group-hover:text-blue-300 transition">Target Ops</span>
                    <span class="text-sm font-medium text-white">${setInfo.name}</span>
                    <span class="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/70 mt-1">${setInfo.count} Data</span>
                `;
                btn.onclick = () => takeSet(setInfo.key, setInfo.name);
                gridSets.appendChild(btn);
            });

            const myHistorySets = allSets.filter(set => set.worker === workerName && set.status !== "Tersedia").sort((a, b) => b.id - a.id); 
            riwayatCount = myHistorySets.length;

            // Desain Tabel Log Minimalis
            myHistorySets.forEach(setInfo => {
                let badge = '';
                if (setInfo.status === "Menunggu Validasi") badge = '<span class="text-yellow-400/90 text-[10px] uppercase tracking-wider font-medium">⏳ Otorisasi</span>';
                else if (setInfo.status === "Valid") badge = '<span class="text-emerald-400 text-[10px] uppercase tracking-wider font-medium">✔️ Selesai</span>';
                else if (setInfo.status === "Gagal") badge = '<span class="text-rose-400 text-[10px] uppercase tracking-wider font-medium">❌ Gagal</span>';
                else if (setInfo.status === "Dikerjakan") badge = '<span class="text-blue-400 text-[10px] uppercase tracking-wider font-medium">🔄 Proses</span>';

                const tr = document.createElement('tr');
                tr.className = "border-b border-white/5";
                tr.innerHTML = `
                    <td class="py-3 px-1 text-xs font-light text-white/80">${setInfo.name}</td>
                    <td class="py-3 px-1 text-right">${badge}</td>
                `;
                historyTbody.appendChild(tr);
            });
        }

        if (setTersediaCount > 0) {
            gridSets.classList.remove('hidden');
            emptyState.classList.add('hidden');
        } else {
            gridSets.classList.add('hidden');
            emptyState.classList.remove('hidden');
        }

        if (riwayatCount > 0) {
            historyTbody.parentElement.classList.remove('hidden');
            historyEmpty.classList.add('hidden');
        } else {
            historyTbody.parentElement.classList.add('hidden');
            historyEmpty.classList.remove('hidden');
        }
    });
}

window.salinNomor = () => {
    const copyText = document.getElementById("target-numbers-display");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value).then(() => alert("✔️ Data berhasil disalin ke clipboard."));
};

window.takeSet = (setKey, setName) => {
    const setTargetRef = ref(db, `sets/${setKey}`);
    let retrievedNumbers = []; 

    runTransaction(setTargetRef, (currentData) => {
        if (currentData && currentData.status === "Tersedia") {
            currentData.status = "Dikerjakan";
            currentData.worker = workerName;
            retrievedNumbers = currentData.numbers || []; 
            return currentData;
        }
        return; 
    }).then(({ committed }) => {
        if (committed) {
            activeSetKey = setKey;
            activeSetName = setName;
            startTask(setName, retrievedNumbers); 
        } else alert(`Akses Ditolak: ${setName} telah dieksekusi operator lain.`);
    });
};

function startTask(setName, numbersArray) {
    isWorking = true;
    document.getElementById('request-area').classList.add('hidden');
    document.getElementById('active-task-area').classList.remove('hidden');
    document.getElementById('target-amount-text').innerText = setName;
    
    const textDisplay = document.getElementById('target-numbers-display');
    textDisplay.value = numbersArray.join('\n'); 
    
    let timer = 20 * 60; 
    const display = document.getElementById('timer-display');
    
    timerInterval = setInterval(() => {
        let minutes = parseInt(timer / 60, 10);
        let seconds = parseInt(timer % 60, 10);
        display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        if (--timer < 0) {
            clearInterval(timerInterval);
            batalTask('Batas Waktu Operasional Habis');
        }
    }, 1000);
}

window.reportIssue = (issueType) => {
    clearInterval(timerInterval);
    batalTask(issueType);
}

function batalTask(alasan) {
    alert(`Gugus Tugas Dibatalkan\nKeterangan: ${alasan}`);
    if (activeSetKey) {
        update(ref(db, `sets/${activeSetKey}`), { status: "Tersedia", worker: "" });
        activeSetKey = null;
        activeSetName = null;
    }
    resetTampilan();
}

window.finishTask = async () => {
    const fileInput = document.getElementById('file-upload');
    const btnKirim = document.getElementById('btn-kirim');

    if (fileInput.files.length === 0) return alert("Laporan visibel (video) wajib disertakan.");
    
    clearInterval(timerInterval);
    const videoFile = fileInput.files[0];
    const fileName = videoFile.name;

    btnKirim.innerText = "Mengamankan Data...";
    btnKirim.disabled = true;
    btnKirim.classList.replace("btn-success", "bg-white/10");

    const formData = new FormData();
    formData.append("chat_id", ADMIN_CHAT_ID);
    formData.append("caption", `📡 **Laporan Operasional**\n\n👤 ID Operator: ${workerName}\n💳 Metode: ${paymentData}\n🎯 Sasaran: ${activeSetName}\n⌛ Status: Menunggu Otorisasi`);
    formData.append("video", videoFile);

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
            method: "POST",
            body: formData
        });

        const tgResult = await response.json();
        if (!tgResult.ok) throw new Error(tgResult.description);

        if (activeSetKey) {
            await update(ref(db, `sets/${activeSetKey}`), { status: "Menunggu Validasi", video: fileName });
            alert("✔️ Data berhasil diotorisasi ke Pusat Kendali.");
        }

    } catch (error) {
        alert("Gagal terhubung ke server Telegram.\nKendala: " + error.message);
        btnKirim.innerText = "Otorisasi & Selesaikan";
        btnKirim.disabled = false;
        btnKirim.classList.replace("bg-white/10", "btn-success");
        return; 
    }

    btnKirim.innerText = "Otorisasi & Selesaikan";
    btnKirim.disabled = false;
    btnKirim.classList.replace("bg-white/10", "btn-success");
    
    activeSetKey = null;
    activeSetName = null;
    resetTampilan();
}

function resetTampilan() {
    isWorking = false;
    document.getElementById('request-area').classList.remove('hidden');
    document.getElementById('active-task-area').classList.add('hidden');
    document.getElementById('timer-display').textContent = '20:00';
    document.getElementById('file-upload').value = "";
    document.getElementById('target-numbers-display').value = "";
          }
      
