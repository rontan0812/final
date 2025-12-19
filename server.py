import tracemalloc
tracemalloc.start()

from flask import Flask, request, jsonify
try:
    from flask_cors import CORS
    _has_cors = True
except Exception:
    _has_cors = False

import os
import traceback
import mail
import threading
import whisper
import sounddevice as sd
import numpy as np
import kachaka_api
import asyncio

client = kachaka_api.aio.KachakaApiClient("192.168.11.92:26400")

app = Flask(__name__)
if _has_cors:
    CORS(app)

recording_state = {
    'is_recording': False,
    'recording': [],
    'stream': None,
    'model': None,
    'is_loading_model': False
}

SAMPLE_RATE = 16000
CHANNELS = 1

from flask import send_from_directory

@app.after_request
def add_headers(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return resp

@app.route('/send-mail', methods=['POST', 'GET', 'OPTIONS'])
def send_mail_endpoint():
    if request.method == 'OPTIONS':
        return ('', 204)

    try:
        image_paths = None
        
        data = request.get_json(silent=True) or {}
        subject = data.get('subject') or mail.SUBJECT
        body = data.get('body') or mail.BODY
        frame_path = os.path.join(os.getcwd(), 'image', 'frame.jpg')
        if os.path.exists(frame_path):
            image_paths = [frame_path]

        recipients = [mail.TO]
        if getattr(mail, 'BCC', None):
            recipients.extend([addr.strip() for addr in mail.BCC.split(',') if addr.strip()])

        msg = mail.create_msg(mail.FROM, recipients, subject, body, image_paths)
        mail.send_mail(mail.FROM, recipients, msg)
        return jsonify({ 'ok': True })
    except Exception as e:
        traceback.print_exc()
        return jsonify({ 'ok': False, 'error': str(e) }), 500

@app.route('/image/<filename>')
def serve_image(filename):
    image_dir = os.path.join(os.getcwd(), 'image')
    return send_from_directory(image_dir, filename)

@app.route('/save-preview', methods=['POST', 'OPTIONS'])
def save_preview_endpoint():
    if request.method == 'OPTIONS':
        return ('', 204)

    try:
        files = request.files
        if not files or 'image' not in files:
            return jsonify({ 'ok': False, 'error': 'No image file provided' }), 400

        f = files['image']
        if not f.filename:
            return jsonify({ 'ok': False, 'error': 'Empty filename' }), 400

        image_dir = os.path.join(os.getcwd(), 'image')
        os.makedirs(image_dir, exist_ok=True)
        
        save_path = os.path.join(image_dir, f.filename)
        f.save(save_path)
        return jsonify({ 'ok': True, 'path': save_path })
    except Exception as e:
        traceback.print_exc()
        return jsonify({ 'ok': False, 'error': str(e) }), 500

def load_whisper_model():
    if recording_state['model'] is None and not recording_state['is_loading_model']:
        recording_state['is_loading_model'] = True
        print("Whisperモデルを読み込んでいます...")
        recording_state['model'] = whisper.load_model("small")
        recording_state['is_loading_model'] = False
        print("準備完了!")

@app.route('/start-recording', methods=['POST', 'OPTIONS'])
def start_recording():
    if request.method == 'OPTIONS':
        return ('', 204)
    
    try:
        if recording_state['is_recording']:
            return jsonify({ 'ok': False, 'error': 'Already recording' }), 400
        
        if recording_state['is_loading_model']:
            return jsonify({ 'ok': False, 'error': 'モデルの読み込み中です。しばらくお待ちください。' }), 400
        
        if recording_state['model'] is None:
            thread = threading.Thread(target=load_whisper_model, daemon=True)
            thread.start()
            return jsonify({ 'ok': False, 'error': 'モデルの読み込みを開始しました。しばらくお待ちください。' }), 400
        
        recording_state['recording'] = []
        recording_state['is_recording'] = True
        
        def callback(indata, frames, time, status):
            if status:
                print(status)
            if recording_state['is_recording']:
                recording_state['recording'].append(indata.copy())
        
        recording_state['stream'] = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            callback=callback
        )
        recording_state['stream'].start()
        
        return jsonify({ 'ok': True, 'message': '録音を開始しました' })
    except Exception as e:
        traceback.print_exc()
        return jsonify({ 'ok': False, 'error': str(e) }), 500

@app.route('/stop-recording', methods=['POST', 'OPTIONS'])
def stop_recording():
    if request.method == 'OPTIONS':
        return ('', 204)
    
    try:
        if not recording_state['is_recording']:
            return jsonify({ 'ok': False, 'error': 'Not recording' }), 400
        
        recording_state['is_recording'] = False
        
        if recording_state['stream']:
            recording_state['stream'].stop()
            recording_state['stream'].close()
            recording_state['stream'] = None
        
        if not recording_state['recording']:
            return jsonify({ 'ok': False, 'error': '録音データがありません' }), 400
        
        if recording_state['model'] is None:
            return jsonify({ 'ok': False, 'error': 'モデルの読み込み中です。しばらく待ってから再度お試しください。' }), 400
        
        audio_data = np.concatenate(recording_state['recording'], axis=0)
        audio_flat = audio_data.flatten().astype(np.float32)
        
        print("📝 文字起こし中...")
        result = recording_state['model'].transcribe(audio_flat, fp16=False, language='ja')
        text = result['text']
        print(f"\n--- 結果 ---\n{text}\n")
        
        return jsonify({ 'ok': True, 'text': text })
    except Exception as e:
        traceback.print_exc()
        recording_state['is_recording'] = False
        if recording_state['stream']:
            recording_state['stream'].stop()
            recording_state['stream'].close()
            recording_state['stream'] = None
        return jsonify({ 'ok': False, 'error': str(e) }), 500

@app.route('/recording-status', methods=['GET', 'OPTIONS'])
def recording_status():
    if request.method == 'OPTIONS':
        return ('', 204)
    
    return jsonify({ 
        'is_recording': recording_state['is_recording'],
        'is_loading_model': recording_state['is_loading_model'],
        'model_ready': recording_state['model'] is not None
    })

@app.route('/kachaka-talk', methods=['POST', 'OPTIONS'])
def kachaka_talk():
    if request.method == 'OPTIONS':
        return ('', 204)
    
    def speak_thread(message):
        async def speak():
            kachaka_client = kachaka_api.aio.KachakaApiClient("192.168.11.92:26400")
            await kachaka_client.speak(message)
        asyncio.run(speak())
    
    try:
        data = request.get_json(silent=True) or {}
        message = data.get('message', '').strip()
        if not message:
            return jsonify({ 'ok': False, 'error': 'メッセージが空です' }), 400
        
        thread = threading.Thread(target=speak_thread, args=(message,), daemon=True)
        thread.start()
        
        return jsonify({ 'ok': True, 'message': 'カチャカが話しました' })
    except Exception as e:
        traceback.print_exc()
        return jsonify({ 'ok': False, 'error': str(e) }), 500
    
@app.route('/kachaka-move-cradle', methods=['POST', 'OPTIONS'])
def kachaka_move_cradle():
    if request.method == 'OPTIONS':
        return ('', 204)
    
    def move_cradle_thread(frequency_ms):
        async def move_cradle():
            kachaka_client = kachaka_api.aio.KachakaApiClient("192.168.11.92:26400")
            iterations = frequency_ms // 4000
            print(f"ゆりかご動作開始: {iterations}回繰り返します")
            try:
                await kachaka_client.speak("ゆりかごを始めます")
            except Exception as e:
                print(f"speak エラー: {e}")
                traceback.print_exc()
            
            for i in range(iterations):
                print(f"動作 {i+1}/{iterations}")
                try:
                    result = await kachaka_client.move_forward(0.1)
                    print(f"前進結果: {result}")
                    await asyncio.sleep(1)
                    result = await kachaka_client.move_forward(-0.1)
                    print(f"後退結果: {result}")
                    await asyncio.sleep(1)
                except Exception as e:
                    print(f"移動エラー: {e}")
                    traceback.print_exc()
            
            try:
                await kachaka_client.speak("ゆりかごを終わります")
            except Exception as e:
                print(f"speak エラー: {e}")
            print("ゆりかご動作完了")
        
        asyncio.run(move_cradle())
    
    try:
        data = request.get_json(silent=True) or {}
        frequency_ms = data.get('frequency_ms', 0)
        if frequency_ms not in [10*60*1000, 20*60*1000, 30*60*1000, 60*60*1000]:
            return jsonify({ 'ok': False, 'error': '時間を選択してください' }), 400
        
        thread = threading.Thread(target=move_cradle_thread, args=(frequency_ms,), daemon=True)
        thread.start()
        
        return jsonify({ 'ok': True, 'message': f'カチャカのゆりかごを開始しました' })
    except Exception as e:
        traceback.print_exc()
        return jsonify({ 'ok': False, 'error': str(e) }), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
