import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from email.utils import formatdate

FROM = 'memorable.glory.145@gmail.com' 
PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', 'meep xlde qmmz fafw') 
PORT = 587 

TO = 'memorable.glory.145@gmail.com'
BCC = 'noa.s0725@gmail.com'

SUBJECT = '見守'
BODY = 'テストメールの本文。'

def create_msg(from_addr, to_addrs, subject, body, image_paths=None):
    if isinstance(to_addrs, (list, tuple)):
        to_header = ", ".join(to_addrs)
    else:
        to_header = to_addrs

    if image_paths:
        msg = MIMEMultipart()
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        for img_path in image_paths:
            if os.path.exists(img_path):
                with open(img_path, 'rb') as f:
                    img_data = f.read()
                img = MIMEImage(img_data, name=os.path.basename(img_path))
                msg.attach(img)
                print(f'添付: {os.path.basename(img_path)}')
            else:
                print(f'警告: 画像が見つかりません: {img_path}')
    else:
        msg = MIMEText(body, 'plain', 'utf-8')
    
    msg["From"] = from_addr
    msg['To'] = to_header
    msg['Subject'] = subject
    msg['Date'] = formatdate()
    return msg

def send_mail(from_addr, to_addrs, msg, smtp_host='smtp.gmail.com', port=PORT):
    if isinstance(to_addrs, str):
        to_addrs = [to_addrs]

    try:
        with smtplib.SMTP(smtp_host, port, timeout=10) as smtpobj:
            smtpobj.starttls()
            smtpobj.login(FROM, PASSWORD)
            smtpobj.sendmail(from_addr, to_addrs, msg.as_string())
    except Exception as e:
        print('Failed to send email:', e)
        raise
    else:
        print('Email sent to:', to_addrs)


if __name__ == '__main__':
    image_paths = ['image/sample2.jpg']
    
    msg = create_msg(FROM, TO, SUBJECT, BODY, image_paths)
    send_mail(FROM, TO, msg)
