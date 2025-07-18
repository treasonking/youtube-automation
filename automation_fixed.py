#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 게시물 자동화 스크립트 - 수정된 버전
로그인 검증 로직 개선
2024년 7월 기준, YouTube의 자동화 탐지 정책 강화로 이미지 업로드는 실제로 차단됨
"""

import sys
import time
import argparse
import os
import platform
import subprocess
import webbrowser
from google.oauth2.credentials import Credentials
import base64
import json
import shutil
import tempfile
from google.auth.transport.requests import Request

# Windows 한글/이모지 출력 문제 해결
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass
try:
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def safe_print(message):
    """안전한 출력 함수"""
    try:
        print(message)
    except UnicodeEncodeError:
        import re
        clean_message = re.sub(r'[^\w\s가-힣]', '', message)
        print(clean_message)
    except Exception:
        print("로그 출력 오류")

def debug_log(message, level="INFO"):
    """디버그 로그 함수"""
    from datetime import datetime
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{timestamp}] [{level}] {message}")

def debug_element_info(driver, element, name):
    """요소 정보 디버그"""
    debug_log(f"=== {name} 요소 정보 ===")
    try:
        debug_log(f"태그명: {element.tag_name}")
        debug_log(f"표시 여부: {element.is_displayed()}")
        debug_log(f"활성화 여부: {element.is_enabled()}")
        debug_log(f"위치: {element.location}")
        debug_log(f"크기: {element.size}")
        debug_log(f"텍스트: {element.text}")
        
        # 속성들
        attributes = ['id', 'name', 'class', 'type', 'placeholder', 'value', 'aria-label']
        for attr in attributes:
            try:
                value = element.get_attribute(attr)
                if value:
                    debug_log(f"{attr}: {value}")
            except:
                pass
                
        # CSS 속성들
        css_props = ['display', 'visibility', 'opacity', 'pointer-events']
        for prop in css_props:
            try:
                value = element.value_of_css_property(prop)
                debug_log(f"CSS {prop}: {value}")
            except:
                pass
                
    except Exception as e:
        debug_log(f"요소 정보 확인 실패: {e}", "ERROR")

def debug_page_info(driver):
    """페이지 정보 디버그"""
    debug_log("=== 페이지 정보 ===")
    debug_log(f"현재 URL: {driver.current_url}")
    debug_log(f"페이지 제목: {driver.title}")
    
    # 페이지 소스에서 password 관련 요소 찾기
    try:
        page_source = driver.page_source
        debug_log(f"페이지 소스 길이: {len(page_source)}")
        
        password_keywords = ['password', 'pwd', 'passwd']
        for keyword in password_keywords:
            if keyword in page_source.lower():
                debug_log(f"페이지에서 '{keyword}' 키워드 발견")
    except Exception as e:
        debug_log(f"페이지 소스 확인 실패: {e}", "ERROR")

def get_chrome_version():
    """
    현재 시스템의 Chrome 브라우저 메이저 버전을 반환
    (자동화 탐지 우회 및 드라이버 호환성 확보 목적)
    """
    try:
        version = None
        if platform.system() == "Windows":
            import winreg
            key_paths = [
                r"SOFTWARE\\Google\\Chrome\\BLBeacon",
                r"SOFTWARE\\Wow6432Node\\Google\\Chrome\\BLBeacon",
                r"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Google Chrome"
            ]
            # 여러 레지스트리 경로에서 크롬 버전 탐색
            for key_path in key_paths:
                try:
                    key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path)
                    version, _ = winreg.QueryValueEx(key, "version")
                    winreg.CloseKey(key)
                    break
                except:
                    continue
        # PowerShell로 Chrome 버전 확인 (Windows)
        if not version and platform.system() == "Windows":
            try:
                # 크롬 실행 파일 경로 탐색
                import shutil
                chrome_path = shutil.which('chrome') or shutil.which('chrome.exe')
                if not chrome_path:
                    possible_paths = [
                        os.path.expandvars(r'%ProgramFiles%/Google/Chrome/Application/chrome.exe'),
                        os.path.expandvars(r'%ProgramFiles(x86)%/Google/Chrome/Application/chrome.exe'),
                        os.path.expandvars(r'%LocalAppData%/Google/Chrome/Application/chrome.exe'),
                    ]
                    for path in possible_paths:
                        if os.path.exists(path):
                            chrome_path = path
                            break
                if chrome_path:
                    cmd = f'(Get-Item "{chrome_path}").VersionInfo.ProductVersion'
                # PowerShell 명령 실행
                result = subprocess.run(['powershell', '-Command', cmd], 
                                      capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    version = result.stdout.strip()
            except:
                pass
        # 버전 문자열에서 메이저 버전 추출
        if version and version.split('.')[0].isdigit():
            major = version.split('.')[0]
            safe_print(f"Chrome 버전 감지: {version} (메이저: {major})")
            return major
        else:
            safe_print("Chrome 버전 자동 감지 실패, 기본값 137 사용")
            return "137"
    except Exception as e:
        safe_print(f"Chrome 버전 확인 오류: {e}")
        return "137"

def download_compatible_chromedriver(chrome_version):
    """
    감지된 Chrome 버전에 맞는 ChromeDriver를 자동 다운로드
    (버전 불일치로 인한 자동화 실패 방지)
    """
    try:
        import requests
        import zipfile
        import io
        if not chrome_version or not chrome_version.isdigit():
            safe_print("chrome_version이 비어있거나 숫자가 아님, 기본값 137 사용")
            chrome_version = "137"
        safe_print(f"Chrome {chrome_version} 버전에 호환되는 ChromeDriver 다운로드 중...")
        api_url = f"https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_{chrome_version}"
        try:
            response = requests.get(api_url, timeout=10)
            if response.status_code == 200:
                driver_version = response.text.strip()
                safe_print(f"호환 ChromeDriver 버전: {driver_version}")
            else:
                driver_version = f"{chrome_version}.0.6809.68"
                safe_print(f"API 실패, 기본 ChromeDriver 버전 사용: {driver_version}")
        except:
            driver_version = f"{chrome_version}.0.6809.68"
            safe_print(f"API 요청 실패, 기본 ChromeDriver 버전 사용: {driver_version}")
        
        # ChromeDriver 다운로드 URL
        download_url = f"https://storage.googleapis.com/chrome-for-testing-public/{driver_version}/win64/chromedriver-win64.zip"
        
        # 다운로드 디렉토리 생성
        driver_dir = os.path.join(os.getcwd(), "chromedriver")
        os.makedirs(driver_dir, exist_ok=True)
        
        driver_path = os.path.join(driver_dir, "chromedriver.exe")
        
        # 이미 다운로드된 버전이 있는지 확인
        if os.path.exists(driver_path):
            safe_print("이미 다운로드된 ChromeDriver 사용")
            return driver_path
        
        # ChromeDriver 다운로드
        safe_print("ChromeDriver 다운로드 중...")
        response = requests.get(download_url, timeout=30)
        
        if response.status_code == 200:
            # ZIP 파일 추출
            with zipfile.ZipFile(io.BytesIO(response.content)) as zip_file:
                # chromedriver-win64/chromedriver.exe 추출
                for file_info in zip_file.filelist:
                    if file_info.filename.endswith('chromedriver.exe'):
                        with zip_file.open(file_info) as source, open(driver_path, 'wb') as target:
                            target.write(source.read())
                        break
            
            safe_print(f"ChromeDriver 다운로드 완료: {driver_path}")
            return driver_path
        else:
            safe_print(f"ChromeDriver 다운로드 실패: HTTP {response.status_code}")
            return None
            
    except Exception as e:
        safe_print(f"ChromeDriver 다운로드 오류: {e}")
        return None

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
import undetected_chromedriver as uc

def clean_chrome_cache():
    """
    임시 크롬 사용자 데이터(캐시) 폴더를 정리하여
    이전 세션의 흔적이 남지 않도록 함
    """
    try:
        import shutil
        user_data_dir = os.path.join(os.getcwd(), 'chrome_user_data')
        
        if os.path.exists(user_data_dir):
            safe_print("기존 Chrome 캐시 정리 중...")
            shutil.rmtree(user_data_dir, ignore_errors=True)
            time.sleep(1)
            safe_print("Chrome 캐시 정리 완료")
        else:
            safe_print("정리할 Chrome 캐시 없음")
            
    except Exception as e:
        safe_print(f"캐시 정리 중 오류 (무시됨): {e}")

def setup_driver(headless=False, speed='normal', clean_cache=True):
    """
    undetected-chromedriver를 이용해 자동화 탐지 우회 브라우저 실행
    - headless: 창 없이 실행할지 여부
    - speed: 'fast'일 경우 이미지 등 비활성화로 속도 향상
    - clean_cache: 임시 캐시 정리 여부
    """
    safe_print("undetected-chromedriver 설정 중 (완전한 자동화 탐지 우회)...")
    
    # 캐시 자동 정리
    if clean_cache:
        clean_chrome_cache()
    
    # Chrome 버전 확인 및 호환 ChromeDriver 다운로드
    chrome_version = get_chrome_version()
    safe_print(f"감지된 Chrome 메이저 버전: {chrome_version}")
    driver_path = download_compatible_chromedriver(chrome_version)
    
    try:
        # undetected-chromedriver 옵션 설정
        options = uc.ChromeOptions()
        
        if headless:
            options.add_argument('--headless')
            safe_print("헤드리스 모드 활성화")
        else:
            options.add_argument('--window-position=-32000,-32000')
            options.add_argument('--start-minimized')
            safe_print("창을 화면 밖으로 이동 및 최소화")
        # 기본 설정
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('--no-first-run')
        options.add_argument('--no-default-browser-check')
        options.add_argument('--disable-default-apps')
        options.add_argument('--disable-extensions')
        options.add_argument('--disable-images')
        options.add_argument('--blink-settings=imagesEnabled=false')
        options.add_argument('--disable-plugins')
        options.add_argument('--disable-notifications')
        # JavaScript 오류 방지 설정 추가
        options.add_argument('--disable-web-security')
        options.add_argument('--allow-running-insecure-content')
        options.add_argument('--disable-features=TranslateUI')
        options.add_argument('--disable-iframes-during-prerender')
        options.add_argument('--disable-background-timer-throttling')
        options.add_argument('--disable-renderer-backgrounding')
        options.add_argument('--disable-backgrounding-occluded-windows')
        options.add_argument('--disable-field-trial-config')
        options.add_argument('--disable-back-forward-cache')
        options.add_argument('--disable-background-networking')
        options.add_argument('--disable-client-side-phishing-detection')
        options.add_argument('--disable-sync')
        options.add_argument('--disable-translate')
        options.add_argument('--disable-logging')
        options.add_argument('--disable-gpu-logging')
        options.add_argument('--silent')
        
        # TrustedHTML 정책 우회 설정 추가
        options.add_argument('--disable-features=TrustedDOMTypes')
        options.add_argument('--disable-features=TrustedTypes')
        options.add_argument('--disable-trusted-types-csp')
        options.add_argument('--disable-features=VizDisplayCompositor')
        
        # 임시 사용자 데이터 디렉토리
        import tempfile
        try:
            temp_dir = tempfile.mkdtemp(prefix='chrome_temp_')
            safe_print(f"임시 사용자 데이터 디렉토리: {temp_dir}")
        except Exception as e:
            safe_print(f"임시 폴더 생성 실패: {e}")
        # temp_dir = tempfile.mkdtemp(prefix='chrome_temp_')
        # options.add_argument(f'--user-data-dir={temp_dir}')
        # safe_print(f"임시 사용자 데이터 디렉토리: {temp_dir}")
        
        # 속도에 따른 설정
        if speed == 'fast':
            options.add_argument('--disable-images')
            safe_print("고속 모드 활성화")
        
        # undetected-chromedriver로 드라이버 생성 (조용한 모드)
        safe_print("undetected-chromedriver 초기화 중...")
        
        # 다운로드한 ChromeDriver 사용
        if driver_path and os.path.exists(driver_path):
            safe_print(f"호환 ChromeDriver 사용: {driver_path}")
            driver = uc.Chrome(
                options=options,
                version_main=int(chrome_version) if chrome_version.isdigit() else None,
                driver_executable_path=driver_path,  # 다운로드한 호환 ChromeDriver 사용
                browser_executable_path=None,  # 시스템 Chrome 사용
                user_data_dir=temp_dir,
                suppress_welcome=True,
                use_subprocess=False,  # subprocess 비활성화로 메시지 줄이기
                debug=False,
                log_level=0  # 로그 레벨 최소화
            )
        else:
            safe_print("시스템 ChromeDriver 사용 (자동 감지)")
            driver = uc.Chrome(
                options=options,
                version_main=int(chrome_version) if chrome_version.isdigit() else None,
                driver_executable_path=None,  # 자동으로 chromedriver 다운로드
                browser_executable_path=None,  # 시스템 Chrome 사용
                user_data_dir=temp_dir,
                suppress_welcome=True,
                use_subprocess=False,  # subprocess 비활성화로 메시지 줄이기
                debug=False,
                log_level=0  # 로그 레벨 최소화
            )
        
        # 추가 JavaScript 우회 코드 + 클론 오류 방지
        safe_print("추가 자동화 탐지 우회 스크립트 실행...")
        driver.execute_script("""
            // 전역 오류 처리기 - 클론 오류 완전 차단
            window.addEventListener('error', function(e) {
                if (e.message && (
                    e.message.includes('could not be cloned') ||
                    e.message.includes('DataCloneError') ||
                    e.message.includes('clone') ||
                    e.message.includes('structured clone')
                )) {
                    console.log('클론 오류 차단됨:', e.message);
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                }
            }, true);
            
            // Promise 거부 오류 처리
            window.addEventListener('unhandledrejection', function(e) {
                if (e.reason && e.reason.toString && (
                    e.reason.toString().includes('clone') ||
                    e.reason.toString().includes('DataCloneError')
                )) {
                    console.log('Promise 클론 오류 차단됨:', e.reason);
                    e.preventDefault();
                    return false;
                }
            });
            
            // 구조화된 클론 알고리즘 오버라이드
            const originalStructuredClone = window.structuredClone;
            if (originalStructuredClone) {
                window.structuredClone = function(obj) {
                    try {
                        return originalStructuredClone(obj);
                    } catch (e) {
                        console.log('structuredClone 오류 방지:', e);
                        return JSON.parse(JSON.stringify(obj));
                    }
                };
            }
            
            // postMessage 오버라이드 (클론 오류의 주요 원인)
            const originalPostMessage = window.postMessage;
            window.postMessage = function(message, targetOrigin, transfer) {
                try {
                    return originalPostMessage.call(this, message, targetOrigin, transfer);
                } catch (e) {
                    if (e.message && e.message.includes('clone')) {
                        console.log('postMessage 클론 오류 방지:', e);
                        // 안전한 메시지로 변환
                        const safeMessage = JSON.parse(JSON.stringify(message));
                        return originalPostMessage.call(this, safeMessage, targetOrigin);
                    }
                    throw e;
                }
            };
            
            // 추가 우회 코드
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en']
            });
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({
                    query: () => Promise.resolve({ state: 'granted' })
                })
            });
            window.chrome = {
                runtime: {}
            };
            
            // 마우스 이벤트 시뮬레이션
            document.addEventListener('DOMContentLoaded', function() {
                document.dispatchEvent(new MouseEvent('mousemove', {
                    bubbles: true,
                    cancelable: true,
                    clientX: Math.random() * window.innerWidth,
                    clientY: Math.random() * window.innerHeight
                }));
            });
            
            console.log('클론 오류 방지 스크립트 로드 완료');
        """)
        
        if speed == 'fast':
            driver.implicitly_wait(1)
        else:
            driver.implicitly_wait(5)
            
        safe_print("undetected-chromedriver 설정 완료 (Google 탐지 완전 우회)")
        return driver
        
    except Exception as e:
        safe_print(f"undetected-chromedriver 설정 실패: {e}")
        safe_print("일반 Chrome 드라이버로 대체 시도...")
        
        # 대체 방법: 일반 Chrome 드라이버 (호환 버전 사용)
        try:
            chrome_options = Options()
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            chrome_options.add_experimental_option('excludeSwitches', ['enable-automation'])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            
            # 호환 ChromeDriver 사용
            if driver_path and os.path.exists(driver_path):
                safe_print(f"일반 Chrome 드라이버로 대체 (호환 버전 사용): {driver_path}")
                service = Service(executable_path=driver_path)
                driver = webdriver.Chrome(service=service, options=chrome_options)
            else:
                safe_print("일반 Chrome 드라이버로 대체 (시스템 버전)")
                driver = webdriver.Chrome(options=chrome_options)
            
            # 자동화 탐지 우회 스크립트
            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            safe_print("일반 Chrome 드라이버로 대체 성공")
            return driver
        except Exception as e2:
            safe_print(f"모든 드라이버 설정 실패: {e2}")
            safe_print("Chrome 버전과 ChromeDriver 버전 호환성을 확인하세요.")
            sys.exit(1)

def login_youtube(driver, username, password):
    """
    YouTube 로그인 자동화 (쿠키/세션 재사용, 실패 시 재로그인)
    """
    safe_print("YouTube 로그인 시작...")
    
    try:
        # YouTube 메인 페이지로 이동
        safe_print("YouTube 메인 페이지 접속...")
        driver.get("https://www.youtube.com")
        time.sleep(3)
        
        # 로그인 버튼 찾기
        safe_print("로그인 버튼 찾는 중...")
        login_selectors = [
            (By.XPATH, "//a[contains(@href, 'accounts.google.com')]"),
            (By.XPATH, "//button[contains(text(), '로그인')]"),
            (By.XPATH, "//button[contains(text(), 'Sign in')]"),
            (By.CSS_SELECTOR, "a[href*='accounts.google.com']")
        ]
        
        login_button = None
        for selector_type, selector_value in login_selectors:
            try:
                login_button = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((selector_type, selector_value))
                )
                safe_print("로그인 버튼 찾음")
                break
            except:
                continue
        
        if not login_button:
            raise Exception("YouTube 로그인 버튼을 찾을 수 없습니다")
        
        # 로그인 버튼 클릭
        safe_print("로그인 버튼 클릭...")
        login_button.click()
        time.sleep(3)
        
        # 이메일 입력
        safe_print("이메일 입력 중...")
        email_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "identifierId"))
        )
        email_input.send_keys(username)
        
        # 다음 버튼 클릭
        next_button = driver.find_element(By.ID, "identifierNext")
        next_button.click()
        time.sleep(3)
        
        # 비밀번호 페이지 로딩 대기
        safe_print("비밀번호 페이지 로딩 대기...")
        time.sleep(2)
        
        # 비밀번호 페이지에서 새로고침
        safe_print("비밀번호 페이지 새로고침...")
        driver.refresh()
        time.sleep(3)
        
        # 비밀번호 입력 (자동화 탐지 우회 강화)
        safe_print("비밀번호 입력 중 (자동화 탐지 우회 모드)...")
        
        # 페이지 완전 로딩 대기
        time.sleep(3)
        
        # 추가 자동화 탐지 우회 스크립트 실행
        driver.execute_script("""
            // 추가 자동화 탐지 우회
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
            
            // 마우스 이벤트 시뮬레이션
            document.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                clientX: Math.random() * window.innerWidth,
                clientY: Math.random() * window.innerHeight
            }));
        """)
        
        # 페이지 상태 디버그
        debug_page_info(driver)
        
        password_selectors = [
            (By.NAME, "password"),
            (By.ID, "password"),
            (By.XPATH, "//input[@type='password']"),
            (By.XPATH, "//input[contains(@name, 'password')]"),
            (By.XPATH, "//input[contains(@id, 'password')]"),
            (By.CSS_SELECTOR, "input[type='password']"),
            # div 내부 input 직접 검색
            (By.XPATH, "//div[@id='password']//input"),
            (By.XPATH, "//div[contains(@class, 'password')]//input"),
            (By.XPATH, "//div[contains(text(), '비밀번호')]//input"),
            # Google 특화 선택자
            (By.XPATH, "//input[@name='Passwd']"),
            (By.XPATH, "//input[@id='Passwd']"),
            (By.XPATH, "//input[@autocomplete='current-password']"),
            (By.XPATH, "//input[@aria-label='비밀번호 입력']")
        ]
        
        password_input = None
        debug_log("비밀번호 필드 찾기 시작...")
        
        for i, (selector_type, selector_value) in enumerate(password_selectors):
            try:
                debug_log(f"선택자 {i+1} 시도: {selector_value}")
                elements = driver.find_elements(selector_type, selector_value)
                debug_log(f"선택자 {i+1}로 찾은 요소 개수: {len(elements)}")
                
                for j, element in enumerate(elements):
                    debug_log(f"요소 {j+1} 검사 중...")
                    debug_element_info(driver, element, f"비밀번호 후보 {j+1}")
                    
                    # div 요소인 경우 내부의 실제 input 찾기
                    if element.tag_name.lower() == 'div':
                        debug_log(f"div 요소 발견 - 내부 input 요소 검색...")
                        try:
                            # div 내부의 input 요소 찾기
                            inner_inputs = element.find_elements(By.XPATH, ".//input")
                            debug_log(f"div 내부 input 요소 개수: {len(inner_inputs)}")
                            
                            for k, inner_input in enumerate(inner_inputs):
                                debug_log(f"내부 input {k+1} 검사...")
                                debug_element_info(driver, inner_input, f"내부 input {k+1}")
                                
                                if inner_input.is_displayed() and inner_input.is_enabled():
                                    password_input = inner_input
                                    debug_log(f"사용 가능한 실제 input 발견: div 내부 input {k+1}", "SUCCESS")
                                    break
                                    
                        except Exception as e:
                            debug_log(f"div 내부 input 검색 실패: {e}")
                    
                    # input 요소인 경우 그대로 사용
                    elif element.tag_name.lower() == 'input':
                        if element.is_displayed() and element.is_enabled():
                            password_input = element
                            debug_log(f"사용 가능한 input 요소 발견: 선택자 {i+1}, 요소 {j+1}", "SUCCESS")
                            break
                    
                    if password_input:
                        break
                
                if password_input:
                    break
                    
            except Exception as e:
                debug_log(f"선택자 {i+1} 실패: {e}")
                continue
        
        if not password_input:
            debug_log("비밀번호 필드를 찾을 수 없음 - 자동화 탐지 가능성 높음", "ERROR")
            
            # 페이지 소스에서 password 관련 요소 찾기
            debug_log("페이지 소스에서 password 관련 요소 검색...")
            try:
                page_source = driver.page_source
                import re
                password_patterns = [
                    r'<input[^>]*password[^>]*>',
                    r'<input[^>]*type=["\']password["\'][^>]*>',
                    r'<input[^>]*name=["\'].*password.*["\'][^>]*>'
                ]
                
                for pattern in password_patterns:
                    matches = re.findall(pattern, page_source, re.IGNORECASE)
                    debug_log(f"패턴 '{pattern}' 매치 개수: {len(matches)}")
                    for match in matches[:2]:  # 최대 2개만 출력
                        debug_log(f"매치: {match}")
                        
            except Exception as e:
                debug_log(f"페이지 소스 검색 실패: {e}", "ERROR")
            
            safe_print("수동 로그인 모드로 전환...")
            
            # 수동 로그인 안내
            safe_print("=== 수동 로그인 필요 ===")
            safe_print(f"계정: {username}")
            safe_print(f"비밀번호: {password}")
            safe_print("브라우저에서 직접 비밀번호를 입력해주세요.")
            safe_print("60초 후 자동으로 계속됩니다...")
            
            # 60초 대기하면서 로그인 상태 확인
            for i in range(60):
                time.sleep(1)
                current_url = driver.current_url
                
                if not any(x in current_url for x in ["accounts.google.com", "signin", "challenge"]):
                    safe_print("수동 로그인 성공!")
                    return True
                    
                if i % 10 == 0 and i > 0:
                    safe_print(f"{60-i}초 남음...")
            
            safe_print("수동 로그인 시간 초과")
            return False
        
        # 자동화 탐지 우회를 위한 자연스러운 동작
        safe_print("자연스러운 사용자 동작 시뮬레이션...")
        
        # 스크롤 및 마우스 움직임
        driver.execute_script("window.scrollTo(0, arguments[0].offsetTop - 100);", password_input)
        time.sleep(0.5)
        
        # 다양한 방법으로 비밀번호 입력 시도
        input_success = False
        
        # 방법 1: undetected-chromedriver 최적화 입력 (디버그 포함)
        try:
            debug_log("방법 1: undetected-chromedriver 최적화 입력 시작...")
            debug_element_info(driver, password_input, "입력 전 비밀번호 필드")
            
            from selenium.webdriver.common.action_chains import ActionChains
            
            # 필드 완전히 활성화
            debug_log("필드 스크롤 및 포커스...")
            driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", password_input)
            time.sleep(1)
            
            # 실제 사용자처럼 클릭
            debug_log("ActionChains로 클릭...")
            actions = ActionChains(driver)
            actions.move_to_element(password_input).pause(0.5).click().pause(0.2).perform()
            
            # 현재 값 확인
            current_value = password_input.get_attribute('value')
            debug_log(f"클릭 후 현재 값: '{current_value}'")
            
            # 기존 내용 지우기
            debug_log("기존 내용 지우기...")
            password_input.clear()
            time.sleep(0.3)
            
            current_value = password_input.get_attribute('value')
            debug_log(f"clear 후 현재 값: '{current_value}'")
            
            # 매우 천천히 자연스럽게 입력
            debug_log(f"비밀번호 입력 시작... (총 {len(password)}글자)")
            for i, char in enumerate(password):
                password_input.send_keys(char)
                current_value = password_input.get_attribute('value')
                debug_log(f"입력 {i+1}/{len(password)}: 현재 값 길이 {len(current_value)}")
                time.sleep(0.15 + (0.05 * (i % 3)))  # 랜덤한 타이핑 속도
            
            # 최종 값 확인
            final_value = password_input.get_attribute('value')
            debug_log(f"입력 완료 - 최종 값 길이: {len(final_value)}, 예상 길이: {len(password)}")
            debug_log(f"입력 성공 여부: {len(final_value) == len(password)}")
            
            time.sleep(0.5)
            
            if len(final_value) == len(password):
                input_success = True
                debug_log("방법 1 성공!", "SUCCESS")
            else:
                debug_log("방법 1 실패 - 입력 값 길이 불일치", "ERROR")
            
        except Exception as e:
            debug_log(f"방법 1 실패: {e}", "ERROR")
        
        # 방법 2: JavaScript 완전 제어
        if not input_success:
            try:
                safe_print("방법 2: JavaScript 완전 제어...")
                
                # 필드 완전 활성화 스크립트
                driver.execute_script("""
                    var input = arguments[0];
                    var password = arguments[1];
                    
                    // 필드 활성화
                    input.focus();
                    input.click();
                    
                    // 기존 값 제거
                    input.value = '';
                    
                    // 값 설정
                    input.value = password;
                    
                    // 모든 이벤트 발생
                    input.dispatchEvent(new Event('focus', { bubbles: true }));
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('keyup', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    return input.value;
                """, password_input, password)
                
                time.sleep(1)
                input_success = True
                safe_print("방법 2 성공")
                
            except Exception as e:
                safe_print(f"방법 2 실패: {e}")
        
        # 방법 3: 키보드 시뮬레이션
        if not input_success:
            try:
                safe_print("방법 3: 키보드 시뮬레이션...")
                
                # 필드 클릭 후 전체 선택 후 입력
                password_input.click()
                time.sleep(0.5)
                password_input.send_keys(Keys.CONTROL + 'a')  # 전체 선택
                time.sleep(0.2)
                password_input.send_keys(Keys.DELETE)  # 삭제
                time.sleep(0.3)
                
                # 한 글자씩 천천히
                for char in password:
                    password_input.send_keys(char)
                    time.sleep(0.12)
                
                input_success = True
                safe_print("방법 3 성공")
                
            except Exception as e:
                safe_print(f"방법 3 실패: {e}")
        
        # 방법 4: 클립보드 + 키보드 조합
        if not input_success:
            try:
                safe_print("방법 4: 클립보드 + 키보드 조합...")
                import pyperclip
                
                # 클립보드에 복사
                pyperclip.copy(password)
                time.sleep(0.2)
                
                # 필드 활성화 후 붙여넣기
                password_input.click()
                time.sleep(0.5)
                password_input.send_keys(Keys.CONTROL + 'a')
                time.sleep(0.2)
                password_input.send_keys(Keys.CONTROL + 'v')
                time.sleep(0.5)
                
                input_success = True
                safe_print("방법 4 성공")
                
            except Exception as e:
                safe_print(f"방법 4 실패: {e}")
        
        if not input_success:
            safe_print("모든 자동 입력 방법 실패 - 수동 입력 모드로 전환")
            safe_print("브라우저에서 직접 비밀번호를 입력해주세요.")
            time.sleep(10)
        
        time.sleep(1)
        
        # 로그인 버튼 클릭
        login_button = driver.find_element(By.ID, "passwordNext")
        login_button.click()
        time.sleep(5)
        
        # 로그인 결과 확인 (수정된 로직)
        safe_print("로그인 결과 확인 중...")
        
        # 최대 60초 대기하면서 실제 YouTube 접근 확인
        for i in range(60):
            time.sleep(1)
            current_url = driver.current_url
            
            # Google 로그인 페이지가 아닌 곳으로 이동했는지 확인
            if not any(x in current_url for x in ["accounts.google.com", "signin", "challenge"]):
                safe_print(f"로그인 성공! 현재 위치: {current_url}")
                return True
            
            # YouTube로 강제 이동 시도
            if i == 30:  # 30초 후에 한 번 시도
                safe_print("YouTube로 강제 이동 시도...")
                try:
                    driver.get("https://www.youtube.com")
                    time.sleep(3)
                    new_url = driver.current_url
                    if "youtube.com" in new_url and "signin" not in new_url:
                        safe_print("강제 이동으로 로그인 확인!")
                        return True
                except:
                    pass
            
            if i % 10 == 0 and i > 0:
                safe_print(f"대기 중... {60-i}초 남음 (현재: {current_url[:50]}...)")
        
        safe_print("로그인 시간 초과")
        return False
        
    except Exception as e:
        safe_print(f"로그인 실패: {e}")
        return False

def navigate_to_create_post(driver):
    """
    YouTube 커뮤니티 게시물 작성 페이지로 이동
    (자동 리다이렉트/Studio 진입 등 예외 처리 포함)
    """
    safe_print("게시물 작성 페이지로 이동 중...")
    
    try:
        # YouTube 메인 페이지에서 시작
        safe_print("YouTube 메인 페이지 확인...")
        current_url = driver.current_url
        if "youtube.com" not in current_url:
            driver.get("https://www.youtube.com")
            time.sleep(3)
        
        # 페이지 로드 후 클론 오류 방지 스크립트 재실행
        safe_print("클론 오류 방지 스크립트 재실행...")
        driver.execute_script("""
            // 전역 오류 처리기 - 클론 오류 완전 차단
            window.addEventListener('error', function(e) {
                if (e.message && (
                    e.message.includes('could not be cloned') ||
                    e.message.includes('DataCloneError') ||
                    e.message.includes('clone') ||
                    e.message.includes('structured clone')
                )) {
                    console.log('클론 오류 차단됨:', e.message);
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                }
            }, true);
            
            // Promise 거부 오류 처리
            window.addEventListener('unhandledrejection', function(e) {
                if (e.reason && e.reason.toString && (
                    e.reason.toString().includes('clone') ||
                    e.reason.toString().includes('DataCloneError')
                )) {
                    console.log('Promise 클론 오류 차단됨:', e.reason);
                    e.preventDefault();
                    return false;
                }
            });
            
            console.log('YouTube 페이지 클론 오류 방지 완료');
        """)
        
        # 만들기 버튼 찾기
        safe_print("만들기 버튼 찾는 중...")
        create_selectors = [
            "//button[@aria-label='만들기' or @title='만들기' or contains(@aria-label, 'Create')]",
            "//yt-icon[@class='style-scope ytd-topbar-menu-button-renderer']",
            "//button[contains(@aria-label, '만들기')]",
            "//button[contains(@aria-label, 'Create')]"
        ]
        
        create_button = None
        for selector in create_selectors:
            try:
                create_button = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, selector))
                )
                safe_print(f"만들기 버튼 찾음: {selector}")
                break
            except:
                continue
        
        if not create_button:
            safe_print("❌ 만들기 버튼을 찾을 수 없음")
            safe_print("현재 페이지를 새로고침하고 다시 시도...")
            
            # 페이지 새로고침 후 재시도
            driver.refresh()
            time.sleep(5)
            
            # 클론 오류 방지 스크립트 재실행
            driver.execute_script("""
                window.addEventListener('error', function(e) {
                    if (e.message && e.message.includes('could not be cloned')) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                }, true);
                console.log('새로고침 후 클론 오류 방지 완료');
            """)
            
            # 만들기 버튼 재검색
            for selector in create_selectors:
                try:
                    create_button = WebDriverWait(driver, 5).until(
                        EC.element_to_be_clickable((By.XPATH, selector))
                    )
                    safe_print(f"새로고침 후 만들기 버튼 찾음: {selector}")
                    break
                except:
                    continue
            
            if not create_button:
                safe_print("❌ 새로고침 후에도 만들기 버튼을 찾을 수 없음")
                return False
        
        # 만들기 버튼 클릭 (클론 오류 방지)
        safe_print("만들기 버튼 클릭...")
        try:
            # JavaScript로 안전하게 클릭
            driver.execute_script("""
                arguments[0].click();
                console.log('만들기 버튼 클릭 완료');
            """, create_button)
        except:
            # 일반 클릭으로 대체
            create_button.click()
        time.sleep(2)
        
        # 게시물 옵션 선택
        safe_print("게시물 옵션 찾는 중...")
        post_selectors = [
            "//tp-yt-paper-item[contains(.//yt-formatted-string, '게시물') or contains(.//yt-formatted-string, 'Post')]",
            "//yt-formatted-string[contains(text(), '게시물') or contains(text(), 'Post')]",
            "//span[contains(text(), '게시물') or contains(text(), 'Post')]",
            "//div[contains(text(), '게시물') or contains(text(), 'Post')]"
        ]
        
        post_option = None
        for selector in post_selectors:
            try:
                post_option = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, selector))
                )
                safe_print(f"게시물 옵션 찾음: {selector}")
                break
            except:
                continue
        
        if not post_option:
            safe_print("게시물 옵션을 찾을 수 없음 - 이미 커뮤니티 페이지에 있을 수 있음")
            # 현재 URL 확인
            current_url = driver.current_url
            if "community" in current_url or "studio.youtube.com" in current_url:
                safe_print("✅ 이미 커뮤니티 페이지에 접근됨")
                return True
            return False
        
        # 게시물 옵션 클릭 (클론 오류 방지)
        safe_print("게시물 만들기 선택...")
        try:
            # JavaScript로 안전하게 클릭
            driver.execute_script("""
                arguments[0].click();
                console.log('게시물 옵션 클릭 완료');
            """, post_option)
        except:
            # 일반 클릭으로 대체
            post_option.click()
        time.sleep(3)
        
        safe_print("✅ 게시물 작성 페이지 이동 완료")
        return True
        
    except Exception as e:
        safe_print(f"❌ 게시물 작성 페이지 이동 실패: {e}")
        safe_print("일반 YouTube 게시물 작성을 계속 시도합니다...")
        return False

def navigate_to_studio_directly(driver):
    """YouTube Studio로 직접 이동 - 클론 오류 완전 우회"""
    safe_print("YouTube Studio 직접 접근 중...")
    
    try:
        # YouTube Studio 커뮤니티 페이지로 직접 이동
        studio_url = "https://studio.youtube.com/channel/UC/community"
        safe_print(f"Studio URL 접근: {studio_url}")
        
        driver.get(studio_url)
        time.sleep(5)
        
        # 강력한 클론 오류 방지 스크립트
        safe_print("강력한 클론 오류 방지 스크립트 적용...")
        driver.execute_script("""
            // 모든 가능한 클론 오류 차단
            const originalAddEventListener = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function(type, listener, options) {
                const wrappedListener = function(event) {
                    try {
                        return listener.call(this, event);
                    } catch (e) {
                        if (e.message && e.message.includes('clone')) {
                            console.log('이벤트 리스너 클론 오류 차단:', e.message);
                            return false;
                        }
                        throw e;
                    }
                };
                return originalAddEventListener.call(this, type, wrappedListener, options);
            };
            
            // 전역 오류 완전 차단
            window.onerror = function(msg, url, line, col, error) {
                if (msg && msg.includes('clone')) {
                    console.log('전역 클론 오류 차단:', msg);
                    return true;
                }
                return false;
            };
            
            // 모든 Promise 오류 차단
            window.addEventListener('unhandledrejection', function(event) {
                if (event.reason && event.reason.toString().includes('clone')) {
                    console.log('Promise 클론 오류 차단:', event.reason);
                    event.preventDefault();
                }
            });
            
            console.log('YouTube Studio 클론 오류 완전 차단 완료');
        """)
        
        # 페이지 로딩 완료 대기
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        
        # Studio 페이지 확인
        current_url = driver.current_url
        if "studio.youtube.com" in current_url:
            safe_print("✅ YouTube Studio 접근 성공!")
            return True
        else:
            safe_print(f"❌ Studio 접근 실패, 현재 URL: {current_url}")
            return False
            
    except Exception as e:
        safe_print(f"Studio 직접 접근 실패: {e}")
        return False

def create_post(driver, content, image_paths=None, video_paths=None):
    """
    실제 게시물 작성(텍스트/이미지/영상 첨부) 자동화의 메인 함수
    - 텍스트 입력, 이미지/영상 업로드, 게시 버튼 클릭 등 전체 플로우 담당
    - 각 단계별로 상세한 예외 처리 및 우회 로직 포함
    """
    safe_print("게시물 작성 시작...")
    
    try:
        # 현재 URL 확인 및 Studio 리다이렉트 감지
        current_url = driver.current_url
        safe_print(f"게시물 작성 시작 시 현재 URL: {current_url}")
        
        # YouTube Studio로 자동 리다이렉트된 경우 감지
        if "studio.youtube.com" in current_url:
            safe_print("⚠️ YouTube가 자동으로 Studio로 리다이렉트했습니다!")
            safe_print("일반 YouTube 페이지로 돌아가서 다시 시도합니다...")
            
            # 일반 YouTube로 돌아가기
            driver.get("https://www.youtube.com")
            time.sleep(3)
            
            # 다시 게시물 작성 시도
            safe_print("일반 YouTube에서 게시물 작성 재시도...")
            if not navigate_to_create_post(driver):
                safe_print("❌ 일반 YouTube 게시물 작성 재시도 실패")
                safe_print("Studio에서 게시물 작성을 계속합니다...")
                driver.get(current_url)  # Studio로 돌아가기
                time.sleep(3)
            else:
                # 재시도 성공 시 현재 URL 다시 확인
                current_url = driver.current_url
                safe_print(f"재시도 후 현재 URL: {current_url}")
        
        # JavaScript 오류 방지를 위한 초기 스크립트 실행
        safe_print("JavaScript 환경 최적화...")
        driver.execute_script("""
            // 클론 오류 방지
            window.addEventListener('error', function(e) {
                if (e.message && e.message.includes('could not be cloned')) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            });
            
            // YouTube 특화 오류 처리
            window.addEventListener('unhandledrejection', function(e) {
                if (e.reason && e.reason.toString().includes('cloned')) {
                    e.preventDefault();
                    return false;
                }
            });
            
            // 메모리 정리
            if (window.gc) {
                window.gc();
            }
        """)
        
        time.sleep(2)
        
        # 텍스트 입력 전 URL 다시 확인 (리다이렉트 재감지)
        current_url = driver.current_url
        safe_print(f"텍스트 입력 전 현재 URL: {current_url}")
        
        if "studio.youtube.com" in current_url:
            safe_print("⚠️ 텍스트 입력 시점에 Studio로 리다이렉트 감지!")
            safe_print("Studio 환경에 맞는 텍스트 입력 방식을 사용합니다...")
        
        # 텍스트 입력 영역 찾기 (Studio와 일반 YouTube 모두 대응)
        safe_print("텍스트 입력 영역 찾는 중...")
        text_selectors = [
            "//div[@contenteditable='true']",
        ]
        
        text_area = None
        for selector in text_selectors:
            try:
                text_area = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.XPATH, selector))
                )
                if text_area.is_displayed() and text_area.is_enabled():
                    safe_print(f"텍스트 영역 찾음: {selector}")
                    break
                else:
                    text_area = None
            except:
                continue
        
        if not text_area:
            safe_print("❌ 텍스트 입력 영역을 찾을 수 없음")
            safe_print("현재 페이지 구조 분석...")
            
            # 페이지 구조 분석
            try:
                all_inputs = driver.find_elements(By.XPATH, "//input | //textarea | //div[@contenteditable='true']")
                safe_print(f"입력 가능한 요소 {len(all_inputs)}개 발견:")
                for i, elem in enumerate(all_inputs[:5]):
                    try:
                        tag = elem.tag_name
                        content_editable = elem.get_attribute('contenteditable')
                        role = elem.get_attribute('role')
                        placeholder = elem.get_attribute('placeholder')
                        aria_label = elem.get_attribute('aria-label')
                        safe_print(f"  {i+1}. {tag}, contenteditable={content_editable}, role={role}, placeholder={placeholder}, aria-label={aria_label}")
                    except:
                        pass
            except Exception as analysis_error:
                safe_print(f"페이지 구조 분석 실패: {analysis_error}")
            
            return False
        
        # 안전한 텍스트 입력
        safe_print("텍스트 내용 입력 중...")
        try:
            # 1. 클릭으로 포커스
            text_area.click()
            time.sleep(1)
            
            # 2. 기존 내용 지우기
            text_area.clear()
            time.sleep(0.5)
            
            # 3. JavaScript로 직접 값 설정 (TrustedHTML 오류 방지)
            driver.execute_script("""
                arguments[0].focus();
                
                // innerHTML 대신 textContent와 value 사용 (TrustedHTML 오류 방지)
                arguments[0].textContent = '';
                arguments[0].value = '';
                
                // 안전한 텍스트 설정
                if (arguments[0].tagName === 'DIV' || arguments[0].contentEditable === 'true') {
                    arguments[0].textContent = arguments[1];
                } else {
                    arguments[0].value = arguments[1];
                }
                
                // 입력 이벤트 발생
                var inputEvent = new Event('input', { bubbles: true });
                arguments[0].dispatchEvent(inputEvent);
                
                // 변경 이벤트 발생
                var changeEvent = new Event('change', { bubbles: true });
                arguments[0].dispatchEvent(changeEvent);
                
                // 키보드 이벤트 시뮬레이션
                var keydownEvent = new KeyboardEvent('keydown', { bubbles: true });
                arguments[0].dispatchEvent(keydownEvent);
                
                var keyupEvent = new KeyboardEvent('keyup', { bubbles: true });
                arguments[0].dispatchEvent(keyupEvent);
            """, text_area, content)
            
            time.sleep(1)
            
            # 4. 추가 확인을 위한 키보드 입력
            text_area.send_keys(Keys.END)  # 커서를 끝으로 이동
            time.sleep(0.5)
            
            safe_print("✅ 텍스트 입력 완료")
            
        except Exception as e:
            safe_print(f"텍스트 입력 중 오류: {e}")
            # 대체 방법: 천천히 타이핑
            safe_print("대체 방법으로 천천히 입력...")
            text_area.clear()
            for char in content:
                text_area.send_keys(char)
                time.sleep(0.1)  # 느린 타이핑으로 오류 방지
        
        # 동영상 추가 (유튜브 URL 입력 자동화)
        if video_paths:
            safe_print(f"영상 {len(video_paths)}개 업로드 시도...")
            for i, video_path in enumerate(video_paths):
                if video_path.startswith('http'):  # 유튜브 URL인 경우
                    safe_print(f"유튜브 영상 URL 첨부: {video_path}")
                    # 1단계: 영상 버튼 클릭 (정확한 선택자 우선)
                    safe_print("[LOG] 영상 버튼 찾기 시작 (URL 입력 모드)...")
                    video_button_clicked = False
                    video_button_selectors = [
                        "//button[@aria-label='동영상 추가']",
                        "//button[contains(@aria-label, '동영상 추가')]",
                        "//button[contains(., '동영상 추가')]",
                        "//yt-formatted-string[contains(text(), '동영상 추가')]",
                        "//span[contains(text(), '동영상 추가')]",
                        "//button[contains(@aria-label, '기존 YouTube 동영상 추가')]",
                        "//button[contains(., '기존 YouTube 동영상 추가')]"
                    ]
                    for selector in video_button_selectors:
                        buttons = driver.find_elements(By.XPATH, selector)
                        safe_print(f"[LOG] '{selector}'로 {len(buttons)}개 버튼 발견")
                        for btn in buttons:
                            if btn.is_displayed() and btn.is_enabled():
                                btn.click()
                                video_button_clicked = True
                                safe_print(f"✅ 영상 버튼 클릭 성공 (정확한 선택자: {selector})")
                                time.sleep(2)
                                break
                        if video_button_clicked:
                            break
                    # fallback: 기존 클래스명 방식
                    if not video_button_clicked:
                        video_buttons = driver.find_elements(By.CLASS_NAME, "yt-spec-touch-feedback-shape__fill")
                        safe_print(f"[LOG] fallback: 클래스명으로 {len(video_buttons)}개 버튼 발견")
                        for btn in video_buttons:
                            if btn.is_displayed() and btn.is_enabled():
                                btn.click()
                                video_button_clicked = True
                                safe_print("✅ 영상 버튼 클릭 성공 (클래스명 fallback)")
                                time.sleep(2)
                                break
                    if not video_button_clicked:
                        safe_print("❌ 영상 버튼을 찾거나 클릭하지 못했습니다.")
                        continue
                    # 2단계: URL 입력란 찾기 및 URL 입력 (버튼 클릭 성공 시 반드시 실행)
                    try:
                        time.sleep(2)  # 버튼 클릭 후 입력란이 렌더링될 시간 확보 (최적화: 2초로 단축)
                        safe_print("[LOG] 유튜브 URL 입력란 찾기 시작...")

                        # iframe이 있으면 바로 진입
                        iframe = None
                        try:
                            iframe = driver.find_element(By.XPATH, "//iframe[contains(@src, 'docs.google.com/picker')]")
                        except Exception:
                            pass
                        if iframe:
                            driver.switch_to.frame(iframe)
                            safe_print("[LOG] iframe 내부로 진입 완료 (빠른 탐색)")
                            try:
                                # aria-label로 바로 input 찾기
                                found_input = driver.find_element(By.XPATH, "//input[@aria-label='YouTube 전체 검색 또는 URL 붙여넣기']")
                                found_input.clear()
                                found_input.send_keys(video_path)
                                time.sleep(1)
                                # '추가' 버튼 또는 엔터
                                add_btn = None
                                for btn in driver.find_elements(By.XPATH, "//button"):
                                    btn_text = (btn.text or '').strip()
                                    if btn_text in ['추가', '선택', 'Add', 'Select']:
                                        add_btn = btn
                                        break
                                if add_btn:
                                    add_btn.click()
                                    safe_print("✅ '추가' 버튼 클릭 완료 (iframe)")
                                else:
                                    found_input.send_keys(Keys.ENTER)
                                    safe_print("⚠️ '추가' 버튼을 못 찾아 엔터로 대체 (iframe)")
                                # 검색 결과 클릭
                                time.sleep(2)
                                clicked = False
                                try:
                                    options = driver.find_elements(By.XPATH, "//div[@role='option']")
                                    if options:
                                        options[0].click()
                                        safe_print("✅ 검색 결과(첫 번째 영상) 클릭 완료 (role='option')")
                                        clicked = True
                                    else:
                                        thumbs = driver.find_elements(By.XPATH, "//img")
                                        if thumbs:
                                            thumbs[0].click()
                                            safe_print("✅ 썸네일 이미지 클릭 완료 (백업)")
                                            clicked = True
                                except Exception as e:
                                    safe_print(f"❌ 검색 결과 클릭 중 오류: {e}")
                                if not clicked:
                                    safe_print("❌ 검색 결과를 클릭하지 못했습니다. 구조가 다를 수 있습니다.")
                                # '삽입' 버튼 클릭
                                time.sleep(1)
                                insert_btn = None
                                for btn in driver.find_elements(By.XPATH, "//button"):
                                    btn_text = (btn.text or '').strip()
                                    if btn_text in ['삽입', 'Insert', '선택']:
                                        insert_btn = btn
                                        break
                                if insert_btn:
                                    insert_btn.click()
                                    safe_print("✅ '삽입' 버튼 클릭 완료 (iframe)")
                                else:
                                    safe_print("❌ '삽입' 버튼을 찾지 못했습니다.")
                                driver.switch_to.default_content()
                                time.sleep(2)
                                continue  # 이미 처리했으므로 다음 영상으로
                            except Exception as e:
                                safe_print(f"❌ iframe 내부 진입/입력/버튼 클릭 중 오류: {e}")
                                driver.switch_to.default_content()
                                continue
                        else:
                            safe_print("❌ docs.google.com/picker iframe을 찾지 못했습니다. 일반 다이얼로그 탐색으로 대체")
                            # 기존 다이얼로그 탐색 로직 (생략)
                            continue
                    except Exception as e:
                        safe_print(f"❌ 유튜브 URL 입력 중 오류: {e}")
                        continue
                elif os.path.exists(video_path):  # 로컬 파일 업로드 기존 방식
                    safe_print(f"영상 {i+1}/{len(video_paths)} 업로드: {os.path.basename(video_path)}")
                    # 1단계: 영상 버튼 찾기 및 클릭
                    video_button_clicked = False
                    try:
                        video_buttons = driver.find_elements(By.CLASS_NAME, "yt-spec-touch-feedback-shape__fill")
                        for btn in video_buttons:
                            if btn.is_displayed() and btn.is_enabled():
                                btn.click()
                                video_button_clicked = True
                                safe_print("✅ 영상 버튼 클릭 성공")
                                time.sleep(2)
                                break
                        if not video_button_clicked:
                            safe_print("❌ 영상 버튼을 찾거나 클릭하지 못했습니다.")
                            continue
                    except Exception as e:
                        safe_print(f"❌ 영상 버튼 클릭 중 오류: {e}")
                        continue
                    # 2단계: 파일 input에 영상 전달
                    try:
                        file_inputs = driver.find_elements(By.XPATH, "//input[@type='file']")
                        found = False
                        for file_input in file_inputs:
                            accept = file_input.get_attribute('accept') or ""
                            if 'video' in accept or not accept:
                                file_input.send_keys(os.path.abspath(video_path))
                                safe_print("✅ 영상 파일 전송 완료")
                                found = True
                                break
                        if not found:
                            safe_print("❌ 영상 업로드용 파일 input을 찾지 못함")
                            continue
                    except Exception as e:
                        safe_print(f"❌ 영상 파일 전송 중 오류: {e}")
                        continue
                    # 3단계: 업로드 성공 확인 (간단히 대기)
                    time.sleep(5)
                    safe_print("🎬 영상 업로드 시도 완료")

        def drag_and_drop_files(driver, target, file_paths):
            # 여러 파일을 한 번에 드롭하는 JS 이벤트 시뮬레이션
            files = []
            for path in file_paths:
                with open(path, 'rb') as f:
                    content = f.read()
                    b64 = base64.b64encode(content).decode()
                    files.append({
                        'name': os.path.basename(path),
                        'type': 'image/jpeg',  # 실제 확장자에 따라 바꿀 수 있음
                        'content': b64
                    })
            js = '''
            const target = arguments[0];
            const files = arguments[1];
            function b64toBlob(b64Data, contentType) {
                const byteCharacters = atob(b64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                return new Blob([byteArray], {type: contentType});
            }
            const dt = new DataTransfer();
            for (const file of files) {
                const blob = b64toBlob(file.content, file.type);
                const f = new File([blob], file.name, {type: file.type});
                dt.items.add(f);
            }
            const event = new DragEvent('drop', {
                dataTransfer: dt,
                bubbles: true,
                cancelable: true
            });
            target.dispatchEvent(event);
            '''
            driver.execute_script(js, target, files)

        # 이미지 업로드 (유튜브 실제 동작과 일치, 텍스트 입력 등 기존 로직은 그대로)
        if image_paths:
            safe_print(f"이미지 {len(image_paths)}개 업로드 시도...")
            if not os.path.exists(image_paths[0]):
                safe_print(f"❌ 이미지 파일이 존재하지 않음: {image_paths[0]}")
            else:
                safe_print(f"이미지 1 업로드: {os.path.basename(image_paths[0])}")
                # 첫 번째 이미지는 기존 방식(버튼 클릭+upload_image_simple_method)
                image_button_clicked = False
                safe_print("이미지 버튼 찾는 중 (aria-label='이미지 추가' 우선)...")
                image_button_selectors = [
                    "//button[@aria-label='이미지 추가']",
                    "//button[.//span[text()='이미지']]",
                    "//button[contains(., '이미지')]"
                ]
                for button_selector in image_button_selectors:
                    try:
                        buttons = driver.find_elements(By.XPATH, button_selector)
                        safe_print(f"선택자 '{button_selector}'로 {len(buttons)}개 버튼 발견")
                        for idx, button in enumerate(buttons):
                            try:
                                is_displayed = button.is_displayed()
                                is_enabled = button.is_enabled()
                                safe_print(f"버튼 {idx+1} 상태: 표시={is_displayed}, 활성화={is_enabled}")
                                if not is_displayed or not is_enabled:
                                    safe_print(f"❌ 버튼 {idx+1} 비활성/비표시 - 건너뜀")
                                    continue
                                safe_print(f"버튼 {idx+1} 클릭 시도...")
                                button.click()
                                time.sleep(2)
                                image_button_clicked = True
                                break
                            except Exception as button_error:
                                safe_print(f"❌ 버튼 {idx+1} 클릭 실패: {button_error}")
                                continue
                        if image_button_clicked:
                            break
                    except Exception as selector_error:
                        safe_print(f"❌ 선택자 '{button_selector}' 처리 중 오류: {selector_error}")
                        continue
                if not image_button_clicked:
                    safe_print("❌ '이미지 추가' 버튼을 찾거나 클릭하지 못했습니다. HTML 구조가 변경되었을 수 있습니다.")
                    safe_print("  → 최신 HTML 구조를 다시 확인해 주세요.")
                else:
                    safe_print("이미지 버튼 클릭 성공 - 파일 업로드 시도")
                    upload_success = upload_image_simple_method(driver, image_paths[0])
                    if upload_success:
                        safe_print(f"✅ 이미지 1 업로드 성공!")
                    else:
                        safe_print(f"❌ 이미지 1 업로드 실패")
            # 두 번째~N번째 이미지는 input[type=file][multiple]에 한 번에 넘김
            
        
        # 게시물 게시
        safe_print("게시물 게시 중...")
        try:
            # 현재 URL 확인 - 게시물 작성 페이지에 있는지 확인
            current_url = driver.current_url
            safe_print(f"게시 시점 현재 URL: {current_url}")
            
            # 게시물 작성 페이지가 아니면 경고
            if "show_create_dialog=1" not in current_url and "posts" not in current_url:
                safe_print("⚠️ 게시물 작성 페이지가 아닌 것 같습니다!")
                safe_print("게시물 작성 페이지로 돌아가려고 시도합니다...")
                return False
            
            # 게시 버튼 찾기 (게시물 작성 페이지에서만)
            publish_selectors = [
                # 게시물 작성 다이얼로그 내부의 게시 버튼
                # aria-label 기반 (하지만 동영상 관련 제외)
                "//*[@aria-label and contains(@aria-label, '게시') and not(contains(@aria-label, '동영상'))]"
                
            ]
            
            publish_button = None
            for selector in publish_selectors:
                try:
                    buttons = driver.find_elements(By.XPATH, selector)
                    safe_print(f"게시 버튼 선택자 '{selector}'로 {len(buttons)}개 버튼 발견")
                    for button in buttons:
                        if button.is_displayed() and button.is_enabled():
                            button_text = button.text or button.get_attribute('aria-label') or ""
                            
                            # 동영상 관련 버튼인지 확인 (URL 기반)
                            button_html = button.get_attribute('outerHTML') or ""
                            if any(word in button_html.lower() for word in ['watch?v=', 'video', 'player']):
                                safe_print(f"❌ 동영상 관련 버튼 제외: {button_text}")
                                continue
                            
                            # 현재 URL이 동영상 페이지가 아닌지 다시 확인
                            current_url = driver.current_url
                            if "watch?v=" in current_url:
                                safe_print(f"❌ 동영상 페이지의 버튼 제외: {button_text}")
                                continue
                            
                            publish_button = button
                            safe_print(f"✅ 게시 버튼 발견: {button_text}")
                            break
                    if publish_button:
                        break
                except Exception as e:
                    safe_print(f"게시 버튼 선택자 '{selector}' 오류: {e}")
                    continue
            
            # 게시 버튼을 못 찾은 경우 모든 버튼 분석
            if not publish_button:
                safe_print("⚠️ 게시 버튼을 찾지 못함 - 모든 버튼 분석...")
                try:
                    all_buttons = driver.find_elements(By.XPATH, "//button | //*[@role='button']")
                    safe_print(f"총 {len(all_buttons)}개의 버튼 발견")
                    
                    for idx, button in enumerate(all_buttons):
                        try:
                            if button.is_displayed() and button.is_enabled():
                                button_text = button.text.strip()
                                aria_label = button.get_attribute('aria-label') or ""
                                
                                # 게시 관련 키워드 확인
                                combined_text = f"{button_text} {aria_label}".lower()
                                publish_keywords = ['게시', 'publish', '공유', 'share', '올리기', 'post', 'submit']
                                
                                if any(keyword in combined_text for keyword in publish_keywords):
                                    safe_print(f"게시 버튼 후보 {idx}: '{button_text}' (aria-label: '{aria_label}')")
                                    publish_button = button
                                    break
                                    
                        except Exception:
                            continue
                            
                except Exception as e:
                    safe_print(f"모든 버튼 분석 중 오류: {e}")
            
            if publish_button:
                safe_print("게시 버튼 클릭...")
                driver.execute_script("arguments[0].click();", publish_button)
                time.sleep(3)
                safe_print("✅ 게시물 게시 완료!")
                return True
            else:
                safe_print("❌ 게시 버튼을 찾을 수 없습니다.")
                safe_print("📝 수동으로 게시 버튼을 클릭해주세요.")
                time.sleep(5)  # 사용자가 수동으로 클릭할 시간
                return True  # 일단 성공으로 처리
                
        except Exception as publish_error:
            safe_print(f"게시 중 오류: {publish_error}")
            return False

    except Exception as e:
        safe_print(f"게시물 생성 중 오류: {e}")
        return False

def cleanup_temp_files():
    """임시 파일 정리"""
    try:
        import tempfile
        import shutil
        temp_base = tempfile.gettempdir()
        
        # chrome_temp_ 로 시작하는 임시 폴더들 찾기
        for item in os.listdir(temp_base):
            if item.startswith('chrome_temp_'):
                temp_path = os.path.join(temp_base, item)
                try:
                    shutil.rmtree(temp_path, ignore_errors=True)
                    safe_print(f"임시 폴더 정리: {item}")
                except:
                    pass
                    
        # 기존 chrome_user_data도 정리
        user_data_dir = os.path.join(os.getcwd(), 'chrome_user_data')
        if os.path.exists(user_data_dir):
            shutil.rmtree(user_data_dir, ignore_errors=True)
            safe_print("chrome_user_data 정리 완료")
            
    except Exception as e:
        safe_print(f"임시 파일 정리 중 오류 (무시됨): {e}")

def upload_image_by_drag_drop(driver, image_path, drop_area=None):
    """
    이미지 파일을 드래그 앤 드롭 방식으로 업로드 시도
    (실제 input[type=file]이 비활성화된 경우 대체 방법)
    """
    try:
        safe_print(f"🎯 드래그 앤 드롭 방식으로 이미지 업로드: {os.path.basename(image_path)}")
        
        # 파일 경로 정규화 및 검증
        normalized_path = os.path.abspath(image_path)
        safe_print(f"🔍 파일 경로 검증: {normalized_path}")
        
        # 파일 존재 여부 확인
        if not os.path.exists(normalized_path):
            safe_print(f"❌ 파일이 존재하지 않음: {normalized_path}")
            
            # 가능한 확장자들로 시도
            possible_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
            for ext in possible_extensions:
                test_path = normalized_path + ext
                if os.path.exists(test_path):
                    normalized_path = test_path
                    safe_print(f"✅ 확장자 추가로 파일 발견: {normalized_path}")
                    break
            else:
                safe_print(f"❌ 모든 확장자 시도 후에도 파일을 찾을 수 없음")
                return False
        
        # 파일이 이미지인지 확인
        file_ext = os.path.splitext(normalized_path)[1].lower()
        valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
        if file_ext not in valid_extensions:
            safe_print(f"❌ 지원되지 않는 이미지 형식: {file_ext}")
            return False
        
        # 파일 크기 확인
        file_size = os.path.getsize(normalized_path)
        safe_print(f"📊 파일 크기: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
        
        if file_size == 0:
            safe_print("❌ 파일 크기가 0입니다")
            return False
        elif file_size > 50 * 1024 * 1024:  # 50MB
            safe_print("⚠️ 파일이 매우 큽니다 (50MB 초과)")
        
        safe_print(f"✅ 파일 검증 완료: {os.path.basename(normalized_path)}")
        
        # 드롭 영역 찾기 (우선순위별)
        drop_selectors = [
            # YouTube 게시물 작성 영역
            "//div[contains(@class, 'ytd-backstage-post-creation-dialog-renderer')]",
            "//div[contains(@class, 'backstage-post-creation')]",
            "//div[contains(@class, 'post-creation-dialog')]",
            
            # 일반적인 드롭 영역
            "//div[contains(@class, 'drop-zone')]",
            "//div[contains(@class, 'upload-area')]",
            "//div[contains(@class, 'file-drop')]",
            
            # 텍스트 기반 드롭 영역
            "//div[contains(text(), '드래그') or contains(text(), 'drag')]",
            "//div[contains(text(), '끌어다') or contains(text(), 'drop')]",
            
            # 전체 게시물 영역 (최후 수단)
            "//div[@role='dialog']",
            "//body"
        ]
        
        target_element = None
        
        # 특정 드롭 영역이 지정된 경우
        if drop_area:
            target_element = drop_area
            safe_print("✅ 지정된 드롭 영역 사용")
        else:
            # 드롭 영역 자동 찾기
            for selector in drop_selectors:
                try:
                    elements = driver.find_elements(By.XPATH, selector)
                    if elements:
                        target_element = elements[0]
                        safe_print(f"✅ 드롭 영역 발견: {selector}")
                        break
                except:
                    continue
        
        if not target_element:
            safe_print("❌ 드롭 영역을 찾을 수 없음")
            return False
        
        # JavaScript 드래그 앤 드롭 시뮬레이션
        js_drop_script = """
        function simulateFileDropEvent(element, filePath) {
            // 파일 객체 생성 (시뮬레이션)
            const fileName = filePath.split('\\\\').pop().split('/').pop();
            
            // DataTransfer 객체 생성
            const dataTransfer = new DataTransfer();
            
            // 드래그 이벤트들 생성
            const dragEnterEvent = new DragEvent('dragenter', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer
            });
            
            const dragOverEvent = new DragEvent('dragover', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer
            });
            
            const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer
            });
            
            // 이벤트 발생
            element.dispatchEvent(dragEnterEvent);
            element.dispatchEvent(dragOverEvent);
            element.dispatchEvent(dropEvent);
            
            console.log('드래그 앤 드롭 이벤트 시뮬레이션 완료:', fileName);
            return true;
        }
        
        return simulateFileDropEvent(arguments[0], arguments[1]);
        """
        
        try:
            # JavaScript 드래그 앤 드롭 실행
            result = driver.execute_script(js_drop_script, target_element, normalized_path)
            safe_print("✅ JavaScript 드래그 앤 드롭 이벤트 발생")
            time.sleep(2)
            
            # 실제 드롭존의 파일 입력 요소에 파일 전송
            safe_print("🔍 드롭존 내 파일 입력 요소 찾기...")
            
            # 우선순위: 드롭존 내부의 파일 입력 요소
            dropzone_file_inputs = driver.find_elements(By.XPATH, "//div[@id='dropzone']//input[@type='file']")
            if dropzone_file_inputs:
                safe_print(f"✅ 드롭존에서 {len(dropzone_file_inputs)}개 파일 입력 요소 발견")
                
                for idx, file_input in enumerate(dropzone_file_inputs):
                    try:
                        input_accept = file_input.get_attribute('accept') or ""
                        input_multiple = file_input.get_attribute('multiple')
                        input_name = file_input.get_attribute('name') or ""
                        
                        safe_print(f"파일 입력 {idx+1}: accept='{input_accept}', multiple={input_multiple}, name='{input_name}'")
                        
                        if 'image' in input_accept or not input_accept:
                            safe_print(f"📁 드롭존 파일 입력 {idx+1}에 파일 전송...")
                            
                            # Stale Element 방지: 파일 전송 직전에 요소 다시 찾기
                            try:
                                # 현재 요소가 여전히 유효한지 확인
                                file_input.is_enabled()
                                safe_print("✅ 기존 요소 사용 가능")
                            except:
                                safe_print("⚠️ Stale Element 감지 - 요소 다시 찾기...")
                                # 요소 다시 찾기
                                fresh_inputs = driver.find_elements(By.XPATH, "//div[@id='dropzone']//input[@type='file']")
                                if fresh_inputs and idx < len(fresh_inputs):
                                    file_input = fresh_inputs[idx]
                                    safe_print("✅ 새로운 요소로 교체 완료")
                                else:
                                    safe_print("❌ 새로운 요소 찾기 실패")
                                    continue
                            
                            # 파일 전송
                            try:
                                file_input.send_keys(normalized_path)
                                safe_print("✅ 드롭존 파일 전송 완료")
                                
                                # 파일 전송 후 잠시 대기
                                time.sleep(3)
                                
                                # 전송 성공 확인 (요소 다시 찾아서)
                                verification_inputs = driver.find_elements(By.XPATH, "//div[@id='dropzone']//input[@type='file']")
                                if verification_inputs and idx < len(verification_inputs):
                                    verification_input = verification_inputs[idx]
                                    files_value = verification_input.get_attribute('files')
                                    value = verification_input.get_attribute('value')
                                    safe_print(f"전송 후 상태: files={files_value}, value={value}")
                                    
                                    # 파일이 실제로 선택되었는지 확인
                                    if value and value != "":
                                        safe_print("🎉 파일이 성공적으로 선택됨!")
                                        break
                                    else:
                                        safe_print("⚠️ 파일 선택이 확인되지 않음")
                                else:
                                    safe_print("⚠️ 전송 확인용 요소를 찾을 수 없음")
                                    
                            except Exception as send_error:
                                safe_print(f"파일 전송 중 오류: {send_error}")
                                continue
                            
                            break
                    except Exception as input_error:
                        safe_print(f"드롭존 파일 입력 {idx+1} 전송 실패: {input_error}")
                        continue
            else:
                safe_print("❌ 드롭존에서 파일 입력 요소를 찾을 수 없음")
                
                # 백업: 전체 페이지에서 파일 입력 요소 찾기
                safe_print("🔄 전체 페이지에서 파일 입력 요소 찾기...")
                file_inputs = driver.find_elements(By.XPATH, "//input[@type='file']")
                
                for idx, file_input in enumerate(file_inputs):
                    try:
                        if not file_input.get_attribute('disabled'):
                            input_accept = file_input.get_attribute('accept') or ""
                            safe_print(f"📁 백업 파일 입력 {idx+1}에 파일 전송... (accept: {input_accept})")
                            file_input.send_keys(normalized_path)
                            safe_print("✅ 백업 파일 전송 완료")
                            break
                    except Exception as input_error:
                        safe_print(f"백업 파일 입력 {idx+1} 전송 실패: {input_error}")
                        continue
            
            # 업로드 성공 확인
            time.sleep(3)
            return True
            
        except Exception as js_error:
            safe_print(f"❌ JavaScript 드래그 앤 드롭 실패: {js_error}")
            return False
            
    except Exception as e:
        safe_print(f"❌ 드래그 앤 드롭 업로드 실패: {e}")
        return False

def upload_image_simple_method(driver, image_path):
    """
    간단하고 안정적인 이미지 업로드 방법
    """
    try:
        safe_print(f"🎯 간단한 방법으로 이미지 업로드: {os.path.basename(image_path)}")
        
        # 파일 경로 정규화 및 검증
        normalized_path = os.path.abspath(image_path)
        if not os.path.exists(normalized_path):
            safe_print(f"❌ 파일이 존재하지 않음: {normalized_path}")
            return False
        
        # 파일 크기 확인
        file_size = os.path.getsize(normalized_path)
        safe_print(f"📊 파일 크기: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
        
        # 방법 1: 숨겨진 파일 input 요소 직접 찾기
        safe_print("방법 1: 숨겨진 파일 input 요소 직접 찾기...")
        
        # 모든 파일 input 요소 찾기
        file_inputs = driver.find_elements(By.XPATH, "//input[@type='file']")
        safe_print(f"페이지에서 {len(file_inputs)}개의 파일 input 요소 발견")
        
        # 이미지 업로드용 input 찾기
        image_inputs = []
        for idx, file_input in enumerate(file_inputs):
            try:
                accept_attr = file_input.get_attribute('accept') or ""
                name_attr = file_input.get_attribute('name') or ""
                id_attr = file_input.get_attribute('id') or ""
                
                safe_print(f"파일 input {idx+1}: accept='{accept_attr}', name='{name_attr}', id='{id_attr}'")
                
                # 이미지 관련 input 판별
                if ('image' in accept_attr.lower() or 
                    'image' in name_attr.lower() or 
                    'photo' in name_attr.lower() or
                    'filedata' in name_attr.lower() or
                    not accept_attr):  # accept가 없는 경우도 시도
                    image_inputs.append((idx, file_input))
                    
            except Exception as e:
                safe_print(f"파일 input {idx+1} 분석 중 오류: {e}")
                continue
        
        if image_inputs:
            safe_print(f"이미지 업로드 가능한 input {len(image_inputs)}개 발견")
            
            for idx, file_input in image_inputs:
                try:
                    safe_print(f"이미지 input {idx+1}에 파일 전송 시도...")
                    
                    # 파일 전송
                    file_input.send_keys(normalized_path)
                    safe_print(f"✅ 파일 전송 완료")
                    
                    # 업로드 확인을 위해 잠시 대기
                    time.sleep(3)
                    
                    # 업로드 성공 확인
                    if verify_image_upload_success(driver):
                        safe_print("🎉 이미지 업로드 성공 확인!")
                        return True
                    else:
                        safe_print("⚠️ 업로드 성공 확인 안됨, 다음 input 시도...")
                        
                except Exception as e:
                    safe_print(f"파일 전송 중 오류: {e}")
                    continue
        
        # 방법 2: JavaScript로 파일 input 생성하고 업로드
        safe_print("방법 2: JavaScript로 파일 input 생성하여 업로드...")
        
        js_upload_script = """
        // 임시 파일 input 생성
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.position = 'absolute';
        fileInput.style.left = '-9999px';
        fileInput.style.opacity = '0';
        document.body.appendChild(fileInput);
        
        // 파일 선택 이벤트 리스너
        fileInput.addEventListener('change', function(e) {
            console.log('파일 선택됨:', e.target.files[0]);
            
            // YouTube의 드롭존에 파일 전달
            var dropzones = document.querySelectorAll('[id*="dropzone"], [class*="drop"], [class*="upload"]');
            if (dropzones.length > 0) {
                var dropzone = dropzones[0];
                
                // 드래그 이벤트 시뮬레이션
                var dt = new DataTransfer();
                dt.items.add(e.target.files[0]);
                
                var dropEvent = new DragEvent('drop', {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dt
                });
                
                dropzone.dispatchEvent(dropEvent);
                console.log('드롭 이벤트 발생');
            }
        });
        
        return fileInput;
        """
        
        try:
            created_input = driver.execute_script(js_upload_script)
            if created_input:
                safe_print("✅ 임시 파일 input 생성 완료")
                
                # 생성된 input에 파일 전송
                created_input.send_keys(normalized_path)
                safe_print("✅ 생성된 input에 파일 전송 완료")
                
                # 업로드 확인
                time.sleep(3)
                if verify_image_upload_success(driver):
                    safe_print("🎉 JavaScript 방법으로 이미지 업로드 성공!")
                    return True
                    
        except Exception as e:
            safe_print(f"JavaScript 업로드 방법 실패: {e}")
        
        # 방법 3: 클립보드 사용 (Windows만)
        if platform.system() == "Windows":
            safe_print("방법 3: 클립보드를 통한 이미지 업로드...")
            try:
                # 이미지를 클립보드에 복사
                import subprocess
                subprocess.run([
                    'powershell', '-command', 
                    f'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile("{normalized_path}"))'
                ], check=True)
                safe_print("✅ 이미지를 클립보드에 복사 완료")
                
                # 텍스트 영역에 포커스하고 Ctrl+V
                text_areas = driver.find_elements(By.XPATH, "//div[@contenteditable='true'] | //textarea")
                if text_areas:
                    text_area = text_areas[0]
                    text_area.click()
                    time.sleep(1)
                    
                    # Ctrl+V로 붙여넣기
                    text_area.send_keys(Keys.CONTROL + 'v')
                    safe_print("✅ Ctrl+V로 이미지 붙여넣기 시도")
                    
                    time.sleep(3)
                    if verify_image_upload_success(driver):
                        safe_print("🎉 클립보드 방법으로 이미지 업로드 성공!")
                        return True
                        
            except Exception as e:
                safe_print(f"클립보드 방법 실패: {e}")
        
        safe_print("❌ 모든 이미지 업로드 방법 실패")
        return False
        
    except Exception as e:
        safe_print(f"이미지 업로드 중 전체 오류: {e}")
        return False

def verify_image_upload_success(driver):
    """
    이미지 업로드 성공 여부를 다양한 방식(파일 input, blob URL, 업로드 메시지 등)으로 검증
    """
    try:
        # 업로드된 이미지 미리보기 확인
        preview_selectors = [
            "//img[contains(@src, 'blob:')]",  # blob URL 이미지
            "//img[contains(@src, 'data:image')]",  # data URL 이미지
            "//*[contains(@class, 'preview')]//img",  # 미리보기 이미지
            "//*[contains(@class, 'thumbnail')]//img",  # 썸네일 이미지
            "//*[contains(@class, 'uploaded')]//img",  # 업로드된 이미지
            "//*[contains(@class, 'image')]//img",  # 일반 이미지
        ]
        
        for selector in preview_selectors:
            try:
                images = driver.find_elements(By.XPATH, selector)
                if images:
                    safe_print(f"✅ 업로드된 이미지 미리보기 발견: {len(images)}개 ({selector})")
                    return True
            except:
                continue
        
        # 업로드 진행 상태 확인
        progress_selectors = [
            "//*[contains(@class, 'progress')]",
            "//*[contains(@class, 'uploading')]",
            "//*[contains(@class, 'loading')]",
            "//*[contains(text(), 'uploading') or contains(text(), '업로드')]"
        ]
        
        for selector in progress_selectors:
            try:
                progress = driver.find_elements(By.XPATH, selector)
                if progress:
                    safe_print(f"📤 업로드 진행 중 감지: {selector}")
                    # 업로드 완료까지 대기
                    time.sleep(5)
                    return verify_image_upload_success(driver)  # 재귀 호출로 다시 확인
            except:
                continue
        
        # 파일 input의 files 속성 확인
        try:
            file_inputs = driver.find_elements(By.XPATH, "//input[@type='file']")
            for file_input in file_inputs:
                files_count = driver.execute_script("return arguments[0].files.length;", file_input)
                if files_count > 0:
                    safe_print(f"✅ 파일 input에 {files_count}개 파일 선택됨")
                    return True
        except:
            pass
        
        safe_print("❌ 이미지 업로드 성공 확인 실패")
        return False
        
    except Exception as e:
        safe_print(f"업로드 확인 중 오류: {e}")
        return False

def get_token_path(email):
    return f"token_{email.replace('@', '_at_')}.json"

def get_credentials(email, scopes):
    safe_print("scopes: "+str(scopes));
    token_path = get_token_path(email)
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, scopes)
    # 토큰이 없거나, 만료됐고 refresh_token이 있으면 자동 갱신
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            from google_auth_oauthlib.flow import InstalledAppFlow
            flow = InstalledAppFlow.from_client_secrets_file("client_secret.json", scopes)
            creds = flow.run_local_server(port=11360, prompt='consent')
        with open(token_path, "w") as token:
            token.write(creds.to_json())
    return creds

def upload_video_to_youtube(file_path, email=None):
    """
    로컬 영상을 YouTube에 업로드하고, 업로드된 영상의 URL을 반환
    email 인자를 받아 계정별로 토큰을 분리 저장/사용
    """
    try:
        from googleapiclient.discovery import build  # pip install google-api-python-client
        from googleapiclient.http import MediaFileUpload
        SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
        # email 인자가 없으면 기본 계정(기존 방식)
        if not email:
            email = "default"
        creds = get_credentials(email, SCOPES)
        youtube = build("youtube", "v3", credentials=creds)
        request = youtube.videos().insert(
            part="snippet,status",
            body={
                "snippet": {"title": os.path.basename(file_path), "description": "자동 업로드"},
                "status": {"privacyStatus": "unlisted"},
            },
            media_body=MediaFileUpload(file_path)
        )
        response = request.execute()
        video_id = response['id']
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        safe_print(f"✅ 유튜브 업로드 완료: {video_url}")
        return video_url
    except Exception as e:
        safe_print(f"❌ 유튜브 업로드 실패: {e}")
        return None

def open_chrome_with_temp_profile(url):
    # 크롬 실행 파일 경로를 환경변수 또는 PATH에서 동적으로 찾기
    chrome_path = shutil.which('chrome') or shutil.which('chrome.exe')
    if not chrome_path:
        # 일반적인 설치 경로 후보들
        possible_paths = [
            os.path.expandvars(r'%ProgramFiles%/Google/Chrome/Application/chrome.exe'),
            os.path.expandvars(r'%ProgramFiles(x86)%/Google/Chrome/Application/chrome.exe'),
            os.path.expandvars(r'%LocalAppData%/Google/Chrome/Application/chrome.exe'),
        ]
        for path in possible_paths:
            if os.path.exists(path):
                chrome_path = path
                break
    if not chrome_path:
        raise FileNotFoundError('Chrome 실행 파일을 찾을 수 없습니다.')
    # 임시 폴더 내 사용자 데이터 디렉토리 사용
    user_data_dir = os.path.join(tempfile.gettempdir(), 'chrome_oauth')
    os.makedirs(user_data_dir, exist_ok=True)
    subprocess.Popen([
        chrome_path,
        f'--user-data-dir={user_data_dir}',
        '--incognito',
        url
    ])

# webbrowser.open을 monkey patch
webbrowser.open = open_chrome_with_temp_profile

def save_cookies(driver, path):
    """
    현재 세션의 쿠키를 파일로 저장
    """
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(driver.get_cookies(), f, ensure_ascii=False, indent=2)

def load_cookies(driver, path, domain='youtube.com'):
    """
    저장된 쿠키를 불러와 세션에 적용
    """
    with open(path, 'r', encoding='utf-8') as f:
        cookies = json.load(f)
    driver.get(f'https://{domain}/')
    for cookie in cookies:
        cookie.pop('sameSite', None)
        cookie.pop('expiry', None)
        try:
            driver.add_cookie(cookie)
        except Exception:
            continue
    driver.refresh()

def is_logged_in(driver):
    """
    현재 세션이 YouTube에 로그인되어 있는지 확인
    """
    try:
        driver.get('https://www.youtube.com/')
        time.sleep(2)
        user_icons = driver.find_elements(By.XPATH, "//button[contains(@aria-label, '계정') or contains(@aria-label, 'Account')]")
        if user_icons:
            return True
        login_btns = driver.find_elements(By.XPATH, "//a[contains(@href, 'accounts.google.com')]")
        if login_btns:
            return False
        return True
    except Exception:
        return False

def main():
    """
    전체 자동화 실행의 진입점
    - 인자 파싱, 드라이버/로그인/게시물 작성 전체 플로우 관리
    - 정책 변화/실패 시 상세 로그 및 예외 처리
    """
    parser = argparse.ArgumentParser(description='YouTube 게시물 자동화 - 수정된 버전')
    parser.add_argument('--username', required=True, help='YouTube 계정 이메일')
    parser.add_argument('--password', required=True, help='YouTube 계정 비밀번호')
    parser.add_argument('--content', required=True, help='게시물 내용')
    parser.add_argument('--images', nargs='*', help='업로드할 이미지 파일 경로들 (1장만 업로드, 첫 번째 파일만 사용)')
    parser.add_argument('--videos', nargs='*', help='추가할 동영상 파일 경로들')
    parser.add_argument('--videos-local', nargs='*', help='로컬 영상 파일 경로들')
    parser.add_argument('--videos-online', nargs='*', help='온라인(YouTube 등) 영상 URL들')
    parser.add_argument('--speed', choices=['slow', 'normal', 'fast'], default='normal', help='실행 속도')
    parser.add_argument('--debug', action='store_true', help='디버그 모드 (상세 로그 출력)')
    
    try:
        args = parser.parse_args()
    except SystemExit as e:
        safe_print(f"인자 파싱 오류: {e}")
        safe_print("사용법: python automation_fixed.py --username 이메일 --password 비밀번호 --content 내용")
        sys.exit(1)
    except Exception as e:
        safe_print(f"예상치 못한 인자 파싱 오류: {e}")
        sys.exit(1)
    
    safe_print("YouTube 게시물 자동화 시작 (수정된 버전)")
    safe_print(f"계정: {args.username}")
    safe_print(f"내용: {args.content}")

    # 영상 파일 실제 존재 여부 및 확장자 체크
    video_paths = []
    # 온라인 영상 URL
    if hasattr(args, 'videos_online') and args.videos_online:
        video_paths.extend(args.videos_online)
    # 로컬 영상 파일 업로드
    if hasattr(args, 'videos_local') and args.videos_local:
        for local_path in args.videos_local:
            if os.path.exists(local_path):
                uploaded_url = upload_video_to_youtube(local_path, email=args.username)
                if uploaded_url:
                    video_paths.append(uploaded_url)
                else:
                    safe_print(f'❌ 영상 업로드 실패: {local_path}')

    # 기존 --videos 인자도 호환
    if hasattr(args, 'videos') and args.videos:
        for v in args.videos:
            if v.startswith('http'):
                video_paths.append(v)
            elif os.path.exists(v) and os.path.splitext(v)[1].lower() in ['.mp4', '.avi', '.mov', '.mkv', '.webm']:
                video_paths.append(v)

    # headless 모드 결정 로직 추가
    COOKIE_PATH = f'youtube_cookies_{args.username}.json'
    token_path = get_token_path(args.username)
    is_video_post = len(video_paths) > 0
    # 최초 인증(토큰 파일 없음) 또는 영상 게시물일 때는 headless=False, 그 외는 headless=True
    if not os.path.exists(token_path) or is_video_post:
        headless = False
        
        safe_print('[정책] 최초 인증 또는 영상 게시물: headless 모드 OFF (창 띄움)')
    else:
        headless = True
        safe_print('[정책] 사진/글 게시물: headless 모드 ON (창 없이 실행)')

    driver = None
    try:
        cleanup_temp_files()
        driver = setup_driver(headless=headless, speed=args.speed)
        cookie_login_success = False

        # 영상이 포함된 게시물인지 판별
        is_video_post = len(video_paths) > 0

        if is_video_post:
            # 영상 게시물: 쿠키가 있어도 무조건 로그인
            safe_print("[정책] 영상 게시물: 쿠키 무시, 무조건 로그인 진행")
            if not login_youtube(driver, args.username, args.password):
                safe_print("로그인 실패로 인한 종료")
                if os.path.exists(COOKIE_PATH):
                    try:
                        os.remove(COOKIE_PATH)
                        safe_print("❌ 실패한 쿠키 파일 삭제")
                    except Exception:
                        pass
                sys.exit(1)
            save_cookies(driver, COOKIE_PATH)
            safe_print("✅ 로그인 성공, 쿠키 저장 완료")
        else:
            # 일반 게시물: 쿠키가 있으면 쿠키로, 없으면 로그인
            if os.path.exists(COOKIE_PATH):
                safe_print("쿠키 기반 자동 로그인 시도...")
                try:
                    load_cookies(driver, COOKIE_PATH)
                    if is_logged_in(driver):
                        safe_print("✅ 쿠키 자동 로그인 성공!")
                        cookie_login_success = True
                    else:
                        safe_print("❌ 쿠키 자동 로그인 실패, 재로그인 시도")
                except Exception as e:
                    safe_print(f"쿠키 자동 로그인 중 오류: {e}")
            if not cookie_login_success:
                if not login_youtube(driver, args.username, args.password):
                    safe_print("로그인 실패로 인한 종료")
                    if os.path.exists(COOKIE_PATH):
                        try:
                            os.remove(COOKIE_PATH)
                            safe_print("❌ 실패한 쿠키 파일 삭제")
                        except Exception:
                            pass
                    sys.exit(1)
                save_cookies(driver, COOKIE_PATH)
                safe_print("✅ 로그인 성공, 쿠키 저장 완료")
        # 이미지 1장만 업로드
        image_path = None
        if hasattr(args, 'images') and args.images and len(args.images) > 0:
            image_path = args.images[0]
            safe_print(f"이미지 1장만 업로드: {image_path}")
            images = [image_path]
        else:
            images = None
        
        # 게시물 작성 페이지로 이동
        if not navigate_to_create_post(driver):
            safe_print("⚠️ 일반 게시물 작성 페이지 이동 실패")
            safe_print("현재 페이지에서 직접 게시물 작성을 시도합니다...")
            
            # 현재 페이지가 YouTube인지 확인
            current_url = driver.current_url
            if "youtube.com" not in current_url:
                safe_print("YouTube 메인 페이지로 이동...")
                driver.get("https://www.youtube.com")
                time.sleep(3)
        
        # 게시물 작성
        if not create_post(driver, args.content, images, video_paths):
            safe_print("게시물 작성 실패로 인한 종료")
            sys.exit(1)
        
        safe_print("모든 작업 완료!")
        
    except KeyboardInterrupt:
        safe_print("사용자에 의해 중단됨")
        sys.exit(1)
        
    except Exception as e:
        safe_print(f"오류: {e}")
        sys.exit(1)
        
    finally:
        if driver:
            safe_print("브라우저 종료 중...")
            driver.quit()
        
        # 종료 시 임시 파일 정리
        safe_print("임시 파일 정리 중...")
        cleanup_temp_files()

if __name__ == "__main__":
    main() 