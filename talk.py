import kachaka_api

client = kachaka_api.aio.KachakaApiClient("192.168.11.92:26400")

client.speak("返答")